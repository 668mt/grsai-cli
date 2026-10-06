"""
grsai-gpt 节点实现 —— 通过 subprocess 调本地的 `grsai gpt --json` CLI

对应 CLI 选项：
  model       --model       (default: gpt-image-2.5)
  prompt      -p / --prompt (required)
  ratio       --ratio
  quality     --quality
  background  --background
  count       -n / --count  (default: 1, max 5)
  max-wait    --max-wait    (seconds; default 600)
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import torch

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


MAX_REF_IMAGES = 5


class GrsaiGptImage:
    """通过 CLI 调用 grsai gpt-image-2 / 2.5 生成图片（最多 5 张参考图）"""

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
                "model": ([
                    "gpt-image-2.5",
                    "gpt-image-2",
                    "gpt-image-2-vip",
                    "gpt-image-2.5-flare",
                    "gpt-image-2.5-sunburst",
                ], {
                    "default": "gpt-image-2.5",
                    "tooltip": "gpt-image 模型版本",
                }),
                "ratio": ([
                    "1:1",          # gpt-image-2 / 2.5: 1024x1024
                    "16:9",         # 1672x941 / vip: 1280x720 / 2048x1152 / 3840x2160
                    "9:16",         # 941x1672  / vip: 720x1280  / 1152x2048 / 2160x3840
                    "4:3",          # 1443x1090 / vip: 1152x864  / 2304x1728 / 3264x2448
                    "3:4",          # 1090x1443 / vip: 864x1152  / 1728x2304 / 2448x3264
                    "3:2",          # 1536x1024 / vip: 1536x1024 / 2048x1360 / 3504x2336
                    "2:3",          # 1024x1536 / vip: 1024x1536 / 1360x2048 / 2336x3504
                    "5:4",          # 1408x1120 / vip: 1120x896  / 2240x1792 / 3200x2560
                    "4:5",          # 1120x1408 / vip: 896x1120  / 1792x2240 / 2560x3200
                    "21:9",         # 1920x832 / vip: 1456x624  / 2912x1248 / 3840x1648
                    "9:21",         # 832x1920  / vip: 624x1456  / 1248x2912 / 1648x3840
                    "1:2",          # 896x1792  / vip: 768x1536  / 1536x3072 / 1920x3840
                    "2:1",          # 1792x896  / vip: 1536x768  / 3072x1536 / 3840x1920
                    "auto",         # 平台自动选
                    # 像素值（vip 模型只能用这些；gpt-image-2/2.5 也可用）
                    "1024x1024",
                    "2048x2048",    # vip 模型
                ], {
                    "default": "1:1",
                    "tooltip": "比例或像素值。\n• gpt-image-2 / 2.5: 比例（如 1:1）或 1K 像素值\n• gpt-image-2-vip / 2.5-flare / 2.5-sunburst: 仅 1-4K 像素值\n• auto: 平台自动选\n完整列表：https://qmy27nhsd9.apifox.cn/452409160e0",
                }),
                "quality": (["auto", "low", "medium", "high", "xhigh", "max"], {
                    "default": "auto",
                    "tooltip": "图片质量档位（与 CLI 端 GPT_IMAGE_QUALITIES 同步）",
                }),
                "background": (["transparent"], {
                    "default": "transparent",
                    "tooltip": "背景类型（CLI 端只支持 transparent；其他值会被 commander 拒绝）",
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
                "seed": ("INT", {
                    "default": 0,
                    "min": 0,
                    "max": 2**31 - 1,
                    "step": 1,
                    "tooltip": "随机种子（0 = 不指定）。固定种子可使生成结果可复现",
                }),
            },
            "optional": optional,
        }

    RETURN_TYPES = ("IMAGE", "STRING")
    RETURN_NAMES = ("images", "filenames")
    FUNCTION = "generate"
    CATEGORY = "Grsai/Image"
    OUTPUT_NODE = False

    def generate(
        self,
        prompt: str,
        model: str,
        ratio: str,
        quality: str,
        background: str,
        count: int,
        max_wait: int,
        retry: int = 2,
        seed: int = 0,
        **kwargs,
    ):
        if not prompt or not prompt.strip():
            raise ValueError("grsai-gpt: prompt 必填")

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
                raise ValueError(f"grsai-gpt: image{i} {e}") from e

        if len(ref_paths) > MAX_REF_IMAGES:
            cleanup_paths(*ref_paths)
            raise ValueError(
                f"grsai-gpt: 参考图共 {len(ref_paths)} 张，"
                f"超过平台上限 {MAX_REF_IMAGES}"
            )

        # 输出目录
        output_dir = get_comfyui_output_dir() / f"grsai-gpt-{int(time.time())}"

        cmd = [
            cli, "gpt",
            "-p", prompt.strip(),
            "--model", model,
            "--ratio", ratio,
            "--quality", quality,
            "--background", background,
            "-n", str(count),
            "--overwrite",
            "--max-wait", str(max_wait),
            "--retry", str(retry),
            "--seed", str(seed),
            "--json",
            "-o", str(output_dir),
        ]
        for p in ref_paths:
            cmd.extend(["-i", p])

        try:
            returncode, stdout, stderr = run_cli_with_progress(
                cmd,
                timeout=max_wait + 60,
                label="grsai-gpt",
            )
        finally:
            cleanup_paths(*ref_paths)

        try:
            data = json.loads(stdout.strip())
        except json.JSONDecodeError as e:
            raise GrsaiCliError(
                f"grsai-gpt: 解析 CLI JSON 失败（exit={returncode}）：\n"
                f"stdout: {stdout[:500]}\n"
                f"stderr: {stderr[:500]}"
            ) from e

        if not data.get("success"):
            err_msg = data.get("error", "未知错误")
            raise GrsaiCliError(f"grsai-gpt: {err_msg}\nstderr: {stderr[-500:]}")

        paths = [r["path"] for r in data.get("results", [])]
        if not paths:
            raise GrsaiCliError(
                f"grsai-gpt: CLI 返回成功但 results 为空\n"
                f"stderr: {stderr[-500:]}"
            )

        try:
            tensors = png_files_to_tensors(paths)
        except Exception as e:
            raise GrsaiCliError(f"grsai-gpt: 读取输出 PNG 失败：{e}") from e

        # filenames: JSON 数组（每个元素是不含路径的 PNG 文件名）
        import json as _json
        filenames = _json.dumps([Path(p).name for p in paths], ensure_ascii=False)
        return (torch.stack(tensors, dim=0), filenames)