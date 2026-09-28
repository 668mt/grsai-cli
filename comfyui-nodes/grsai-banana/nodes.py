"""
grsai-banana 节点实现 —— 通过 subprocess 调本地的 `grsai banana --json` CLI

业务逻辑（API Key / 轮询 / 重试 / 下载）全部由 CLI 统一管理。
节点只负责：
  1) 把 ComfyUI IMAGE tensor 存为临时 PNG（参考图）
  2) subprocess 调 `grsai banana --json -p ...`
  3) 解析 stdout 的 JSON，拿到 results[].path
  4) 读 PNG 文件，转 ComfyUI IMAGE tensor

对应 CLI 选项：
  model       --model       (default: nano-banana-2)
  prompt      -p / --prompt (required)
  ratio       --ratio       (default: 1:1)
  size        --size        (default: 2K)
  count       -n / --count  (default: 1, max 5)
  overwrite   --overwrite
  max-wait    --max-wait    (seconds; default 600)
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import torch

# 兼容两种安装方式：
#   1. 拷贝到 ComfyUI/custom_nodes/grsai-banana/ —— _shared 是同级目录的兄弟包
#   2. 通过 PYTHONPATH 把 comfyui-nodes/ 加入路径 —— _shared 是顶层包
try:
    from _shared.cli_runner import (
        GrsaiCliError,
        cleanup_paths,
        find_grsai_cli,
        get_comfyui_output_dir,
        png_files_to_tensors,
        run_cli_with_progress,
        tensor_to_temp_files,
    )
except ImportError:
    PARENT = Path(__file__).resolve().parent.parent
    if str(PARENT) not in sys.path:
        sys.path.insert(0, str(PARENT))
    from _shared.cli_runner import (  # type: ignore
        GrsaiCliError,
        cleanup_paths,
        find_grsai_cli,
        get_comfyui_output_dir,
        png_files_to_tensors,
        run_cli_with_progress,
        tensor_to_temp_files,
    )


# 平台上限：nano-banana 最多 5 张参考图
MAX_REF_IMAGES = 5


class GrsaiBanana:
    """通过 CLI 调用 grsai nano-banana 生成图片（最多 5 张参考图）"""

    @classmethod
    def INPUT_TYPES(cls):
        optional = {}
        for i in range(1, MAX_REF_IMAGES + 1):
            optional[f"image{i}"] = ("IMAGE", {
                "tooltip": f"参考图 {i}（可选；最多 {MAX_REF_IMAGES} 个 input，每个可批量传图）",
            })
        return {
            "required": {
                "prompt": ("STRING", {
                    "multiline": True,
                    "default": "",
                    "tooltip": "提示词",
                }),
                "ratio": ([
                    "1:1", "16:9", "9:16", "4:3", "3:4",
                    "3:2", "2:3", "5:4", "4:5", "21:9",
                    "1:4", "4:1", "1:8", "8:1", "auto",
                ], {
                    "default": "1:1",
                    "tooltip": "图片宽高比（与 CLI 端 BANANA_ASPECT_RATIOS 同步）",
                }),
                "size": (["1K", "2K", "4K"], {
                    "default": "2K",
                    "tooltip": "图片分辨率档位",
                }),
                "model": ([
                    "nano-banana-2",
                    "nano-banana",
                    "nano-banana-fast",
                    "nano-banana-2-cl",
                    "nano-banana-2-2k-cl",
                    "nano-banana-2-4k-cl",
                    "nano-banana-pro",
                    "nano-banana-pro-vt",
                    "nano-banana-pro-cl",
                    "nano-banana-pro-vip",
                    "nano-banana-pro-4k-vip",
                ], {
                    "default": "nano-banana-2",
                    "tooltip": "nano-banana 模型版本（与 CLI 端 BANANA_MODELS 同步）",
                }),
                "count": ("INT", {
                    "default": 1,
                    "min": 1,
                    "max": 5,
                    "step": 1,
                    "tooltip": "生成张数（1~5，并发）",
                }),
                "max_wait": ("INT", {
                    "default": 600,
                    "min": 60,
                    "max": 1800,
                    "step": 60,
                    "tooltip": "最长等待时间（秒），超时则失败",
                }),
                "retry": ("INT", {
                    "default": 2,
                    "min": 0,
                    "max": 10,
                    "step": 1,
                    "tooltip": "CLI 内部重试次数（0 = 不重试，默认 2）。整个生成流程（submit + poll + download）作为原子单元",
                }),
            },
            "optional": optional,
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("images",)
    FUNCTION = "generate"
    CATEGORY = "Grsai/Image"
    OUTPUT_NODE = False

    def generate(
        self,
        prompt: str,
        ratio: str,
        size: str,
        model: str,
        count: int,
        max_wait: int,
        retry: int = 2,
        **kwargs,
    ):
        if not prompt or not prompt.strip():
            raise ValueError("grsai-banana: prompt 必填")

        cli = find_grsai_cli()

        # 收集所有参考图 → 临时 PNG 文件
        ref_paths: list[str] = []
        for i in range(1, MAX_REF_IMAGES + 1):
            t = kwargs.get(f"image{i}")
            if t is None:
                continue
            try:
                ref_paths.extend(tensor_to_temp_files(t))
            except ValueError as e:
                cleanup_paths(*ref_paths)
                raise ValueError(f"grsai-banana: image{i} {e}") from e

        if len(ref_paths) > MAX_REF_IMAGES:
            cleanup_paths(*ref_paths)
            raise ValueError(
                f"grsai-banana: 参考图共 {len(ref_paths)} 张，"
                f"超过平台上限 {MAX_REF_IMAGES}"
            )

        # 输出目录：<ComfyUI>/output/grsai-banana-<ts>/
        output_dir = get_comfyui_output_dir() / f"grsai-banana-{int(time.time())}"

        cmd = [
            cli, "banana",
            "-p", prompt.strip(),
            "--ratio", ratio,
            "--size", size,
            "--model", model,
            "-n", str(count),
            "--overwrite",
            "--max-wait", str(max_wait),
            "--retry", str(retry),
            "--json",
            "-o", str(output_dir),
        ]
        # 每个参考图传一个 -i
        for p in ref_paths:
            cmd.extend(["-i", p])

        try:
            returncode, stdout, stderr = run_cli_with_progress(
                cmd,
                timeout=max_wait + 60,
                label="grsai-banana",
            )
        finally:
            cleanup_paths(*ref_paths)

        # 解析 JSON
        try:
            data = json.loads(stdout.strip())
        except json.JSONDecodeError as e:
            raise GrsaiCliError(
                f"grsai-banana: 解析 CLI JSON 失败（exit={returncode}）：\n"
                f"stdout: {stdout[:500]}\n"
                f"stderr: {stderr[:500]}"
            ) from e

        if not data.get("success"):
            err_msg = data.get("error", "未知错误")
            raise GrsaiCliError(f"grsai-banana: {err_msg}\nstderr: {stderr[-500:]}")

        paths = [r["path"] for r in data.get("results", [])]
        if not paths:
            raise GrsaiCliError(
                f"grsai-banana: CLI 返回成功但 results 为空\n"
                f"stderr: {stderr[-500:]}"
            )

        # 读 PNG → tensor
        try:
            tensors = png_files_to_tensors(paths)
        except Exception as e:
            raise GrsaiCliError(f"grsai-banana: 读取输出 PNG 失败：{e}") from e

        # 成功
        return (torch.stack(tensors, dim=0),)