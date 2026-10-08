"""
grsai-minimax-h3 节点实现 —— 通过 subprocess 调本地的 `grsai minimax-h3 --json` CLI

对应 CLI 选项：
  prompt       -p / --prompt (required)
  ratio        --ratio        (required: portrait | landscape)
  resolution   --resolution   (required: 480p | 768p | 1080p)
  duration     --duration     (required: 1~15 sec; 1080p <= 10)
  count        -n / --count   (default: 1, max 5)
  max-wait     --max-wait     (seconds; default 900)

输出：
  - STRING: 第一个视频的本地路径
  - IMAGE: 视频第一帧预览（用 ffmpeg / imageio 提取）
"""
from __future__ import annotations

import io
import json
import os
import sys
import time
from pathlib import Path

import numpy as np
import torch
from PIL import Image

try:
    from _shared.cli_runner import (
        GrsaiCliError,
        cleanup_paths,
        find_grsai_cli,
        get_comfyui_output_dir,
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
        run_cli_with_progress,
        tensor_to_temp_files,
    )


# 平台上限：minimax-h3 最多 9 张参考图
MAX_REF_IMAGES = 9


class GrsaiMinimaxH3:
    """通过 CLI 调用 grsai minimax-h3 生成视频（最多 9 张参考图），返回路径 + 首帧预览"""

    @classmethod
    def INPUT_TYPES(cls):
        optional = {
            "prompt_text": ("STRING", {
                "tooltip": "动态 prompt 输入（从其他 STRING 节点连过来；优先于 widget prompt 输入框）",
            }),
        }
        for i in range(1, MAX_REF_IMAGES + 1):
            optional[f"image{i}"] = ("IMAGE", {
                "tooltip": f"参考图 {i}（可选；最多 {MAX_REF_IMAGES} 个 input，每个可批量传图）",
            })
        optional["seed"] = ("INT", {
            "default": 0,
            "min": 0,
            "max": 2**31 - 1,
            "tooltip": "随机种子（0 = 不指定）",
        })

        return {
            "required": {
                "prompt": ("STRING", {
                    "multiline": True,
                    "default": "",
                    "tooltip": "视频描述提示词（widget 输入框；当 prompt_text 有连接时此框被忽略）",
                }),
                "ratio": (["portrait", "landscape"], {
                    "default": "landscape",
                    "tooltip": "portrait=竖屏 / landscape=横屏",
                }),
                "resolution": (["480p", "768p", "1080p"], {
                    "default": "768p",
                    "tooltip": "分辨率（1080p 最长 10 秒）",
                }),
                "duration": ("INT", {
                    "default": 5,
                    "min": 1,
                    "max": 15,
                    "step": 1,
                    "tooltip": "视频时长（秒，1080p ≤ 10）",
                }),
                "max_wait": ("INT", {
                    "default": 900,
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

    RETURN_TYPES = ("STRING", "IMAGE", "STRING")
    RETURN_NAMES = ("video_path", "preview_frame", "status")
    FUNCTION = "generate"
    CATEGORY = "Grsai/Video"
    OUTPUT_NODE = False

    def generate(
        self,
        prompt: str,
        ratio: str,
        resolution: "long",
        duration: int,
        max_wait: int,
        retry: int = 2,
        seed: int = 0,
        unique_id=None,
        **kwargs,
    ):
        import time as _time
        start_time = _time.monotonic()

        def _push_status(text: str) -> None:
            if not unique_id:
                return
            try:
                from server import PromptServer  # type: ignore
                PromptServer.instance.send_progress_text(text, unique_id)
            except Exception:
                pass

        # prompt_text socket 优先于 widget prompt
        prompt_override = kwargs.get("prompt_text")
        if isinstance(prompt_override, str) and prompt_override.strip():
            prompt = prompt_override
        if not prompt or not prompt.strip():
            raise ValueError("grsai-minimax-h3: prompt 必填（widget 输入框 或 prompt_text socket 至少一个非空）")

        if resolution == "1080p" and duration > 10:
            raise ValueError("grsai-minimax-h3: 1080p 分辨率最多支持 10 秒")
        if duration < 1 or duration > 15:
            raise ValueError("grsai-minimax-h3: duration 必须在 1~15 秒之间")

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
                raise ValueError(f"grsai-minimax-h3: image{i} {e}") from e

        if len(ref_paths) > MAX_REF_IMAGES:
            cleanup_paths(*ref_paths)
            raise ValueError(
                f"grsai-minimax-h3: 参考图共 {len(ref_paths)} 张，"
                f"超过平台上限 {MAX_REF_IMAGES}"
            )

        # 输出目录
        output_dir = get_comfyui_output_dir() / f"grsai-minimax-h3-{int(time.time())}"

        cmd = [
            "minimax-h3",
            "-p", prompt.strip(),
            "--ratio", ratio,
            "--resolution", resolution,
            "--duration", str(duration),
            "--overwrite",
            "--max-wait", str(max_wait),
            "--retry", str(retry),
            "--json",
            "-o", str(output_dir),
        ]
        if seed and seed > 0:
            cmd.extend(["--seed", str(int(seed))])
        for p in ref_paths:
            cmd.extend(["-i", p])

        try:
            returncode, stdout, stderr = run_cli_with_progress(
                cmd,
                timeout=max_wait + 60,
                label="grsai-minimax-h3",
                node_id=unique_id,
            )
        finally:
            cleanup_paths(*ref_paths)

        try:
            data = json.loads(stdout.strip())
        except json.JSONDecodeError as e:
            raise GrsaiCliError(
                f"grsai-minimax-h3: 解析 CLI JSON 失败（exit={returncode}）：\n"
                f"stdout: {stdout[:500]}\n"
                f"stderr: {stderr[:500]}"
            ) from e

        if not data.get("success"):
            err_msg = data.get("error", "未知错误")
            elapsed = _time.monotonic() - start_time
            _push_status(f"[grsai-minimax-h3] FAIL {elapsed:.1f}s: {err_msg[:200]}")
            raise GrsaiCliError(f"grsai-minimax-h3: {err_msg}\nstderr: {stderr[-500:]}")

        paths = [r["path"] for r in data.get("results", [])]
        if not paths:
            elapsed = _time.monotonic() - start_time
            _push_status(f"[grsai-minimax-h3] FAIL {elapsed:.1f}s: empty results")
            raise GrsaiCliError(
                f"grsai-minimax-h3: CLI 返回成功但 results 为空\n"
                f"stderr: {stderr[-500:]}"
            )

        # 取第一个视频的路径 + 首帧预览
        first_video_path = paths[0]
        first_frame = self._extract_first_frame(first_video_path)
        if first_frame is None:
            first_frame = torch.zeros((1, 64, 64, 3), dtype=torch.float32)

        elapsed = _time.monotonic() - start_time
        status = f"OK {elapsed:.1f}s · {len(paths)} 个视频"
        _push_status(f"[grsai-minimax-h3] {status}")
        return (first_video_path, first_frame, status)

    # ---------------- helpers ----------------

    def _extract_first_frame(self, video_path: str) -> torch.Tensor | None:
        """提取视频第一帧。优先 ffmpeg，回退 imageio。"""
        try:
            import subprocess

            out = subprocess.run(
                ["ffmpeg", "-y", "-i", video_path, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"],
                capture_output=True,
                timeout=30,
            )
            if out.returncode == 0 and out.stdout:
                img = Image.open(io.BytesIO(out.stdout)).convert("RGB")
                arr = np.asarray(img, dtype=np.float32) / 255.0
                return torch.from_numpy(arr).unsqueeze(0)
        except (FileNotFoundError, subprocess.TimeoutExpired, Exception):
            pass

        try:
            import imageio.v3 as iio

            frame = iio.imread(video_path, index=0)
            arr = np.asarray(frame, dtype=np.float32) / 255.0
            if arr.ndim == 3 and arr.shape[-1] == 4:
                arr = arr[..., :3]
            return torch.from_numpy(arr).unsqueeze(0)
        except Exception:
            pass

        print(
            f"[grsai-minimax-h3] 无法提取首帧（需要 ffmpeg 或 imageio[ffmpeg]）: {video_path}"
        )
        return None