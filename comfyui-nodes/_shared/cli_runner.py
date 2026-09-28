"""
grsai CLI 调用工具（ComfyUI 节点用）

所有节点统一通过 subprocess 调本地的 `grsai` 命令行实现，不直接对接 grsai API：
    - API Key / 代理 / baseUrl / 重试 / 轮询参数 全部由 CLI 统一管理
    - 用户在 ~/.grsai/config.json 配一次，CLI 和节点共享
    - 业务逻辑（submit + poll + download + retry + 并发）跟 CLI 端对齐
    - 升级 CLI 节点自动跟随

本文件提供：
    - find_grsai_cli()       跨平台找 grsai 可执行文件
    - tensor_to_temp_file()  ComfyUI IMAGE tensor → 临时 PNG 文件
    - tensor_to_temp_files() batch tensor → N 个临时 PNG 文件
    - get_comfyui_output_dir() 找 ComfyUI/output/ 目录
    - run_cli()              包装 subprocess.run，自动诊断
    - cleanup_paths()        清理临时文件
    - GrsaiCliError          统一错误类型
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import torch
from PIL import Image


class GrsaiCliError(RuntimeError):
    pass


# ---------------- 找 CLI 可执行文件 ----------------

def find_grsai_cli() -> str:
    """跨平台找 grsai 可执行文件。

    优先级：
      1) shutil.which("grsai")  —— 最通用（PATH 中能找到）
      2) Windows 全局 npm 路径下的 grsai.cmd / grsai
      3) 抛错，提示安装
    """
    found = shutil.which("grsai")
    if found:
        return found

    if sys.platform == "win32":
        # Windows 上 npm i -g 安装到 %npm_config_prefix%/grsai.cmd
        candidates: list[Path] = []
        npm_prefix = os.environ.get("npm_config_prefix", "")
        if npm_prefix:
            candidates.append(Path(npm_prefix) / "grsai.cmd")
        # 用户实际用的常见位置
        candidates.extend([
            Path("D:/npm/grsai.cmd"),
            Path("C:/npm/grsai.cmd"),
        ])
        for cand in candidates:
            if cand.is_file():
                return str(cand)

    raise GrsaiCliError(
        "未找到 grsai CLI。请先全局安装：\n"
        "  npm i -g grsai-cli\n"
        "安装完后 `grsai --version` 应该能跑通"
    )


# ---------------- ComfyUI IMAGE ↔ 临时文件 ----------------

def tensor_to_temp_file(tensor: torch.Tensor, suffix: str = ".png") -> str:
    """把单张 ComfyUI IMAGE tensor 保存到临时 PNG 文件，返回路径。

    ComfyUI IMAGE: shape [H, W, C], float32, range [0, 1]
    """
    fd, path = tempfile.mkstemp(suffix=suffix, prefix="grsai_ref_")
    os.close(fd)
    arr = (tensor.clamp(0.0, 1.0) * 255.0).to(torch.uint8).cpu().numpy()
    Image.fromarray(arr).save(path, format="PNG", optimize=False)
    return path


def tensor_to_temp_files(tensor: torch.Tensor, suffix: str = ".png") -> list[str]:
    """把 batch tensor ([N, H, W, 3]) 或单图 tensor 保存成 N 个临时 PNG。

    用于参考图：上游如果是 batch 输出，自动拆成 N 张传给 CLI 的 -i。
    """
    if tensor.ndim == 3:
        return [tensor_to_temp_file(tensor, suffix)]
    if tensor.ndim == 4:
        return [tensor_to_temp_file(tensor[i], suffix) for i in range(tensor.shape[0])]
    raise ValueError(
        f"grsai-node: 不支持的 IMAGE tensor shape {tuple(tensor.shape)}，"
        f"应为 [H, W, C] 或 [N, H, W, 3]"
    )


def tensor_to_data_url(tensor: torch.Tensor, media_type: str = "image/png") -> str:
    """把 ComfyUI IMAGE tensor 直接转成 base64 data URL（无需落临时文件）。

    用于 LLM 节点：图片直接 inline 到 API 请求体（Anthropic / OpenAI 兼容格式）。

    Args:
        tensor: shape [H, W, C] 单图；或 [N, H, W, 3] batch（取第一张）
        media_type: MIME 类型，默认 image/png

    Returns:
        "data:{media_type};base64,..."
    """
    import base64
    if tensor.ndim == 4:
        # batch → 取第一张
        tensor = tensor[0]
    if tensor.ndim != 3:
        raise ValueError(
            f"grsai-node: 不支持的 IMAGE tensor shape {tuple(tensor.shape)}，"
            f"应为 [H, W, C] 或 [N, H, W, 3]"
        )
    import io
    from PIL import Image
    arr = (tensor.clamp(0.0, 1.0) * 255.0).to(torch.uint8).cpu().numpy()
    img = Image.fromarray(arr)
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=False)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:{media_type};base64,{b64}"


def png_file_to_tensor(path: str | Path) -> torch.Tensor:
    """读取 PNG 文件，转成 ComfyUI IMAGE tensor [H, W, 3]。"""
    import numpy as np

    img = Image.open(str(path)).convert("RGB")
    arr = np.asarray(img, dtype=np.float32) / 255.0
    return torch.from_numpy(arr)


def png_files_to_tensors(paths: list[str | Path]) -> list[torch.Tensor]:
    """批量读 PNG 文件 → list of [H, W, 3] tensors。"""
    return [png_file_to_tensor(p) for p in paths]


# ---------------- ComfyUI output 目录 ----------------

def get_comfyui_output_dir() -> Path:
    """找 ComfyUI output 目录。

    优先级：
      1) 环境变量 COMFYUI_OUTPUT_DIR
      2) 解析 custom_nodes/<node>/../../output（标准部署结构）
      3) custom_nodes/<node>/../output
      4) cwd/output
      5) 兜底：在文件同级建一个 output/
    """
    env = os.environ.get("COMFYUI_OUTPUT_DIR")
    if env:
        return Path(env)

    here = Path(__file__).resolve().parent  # _shared/
    for ancestor in [here.parent.parent, here.parent, Path.cwd()]:
        candidate = ancestor / "output"
        if candidate.is_dir():
            return candidate

    # 兜底：脚本同级 output/
    fallback = here.parent / "output"
    fallback.mkdir(parents=True, exist_ok=True)
    return fallback


# ---------------- subprocess 包装 ----------------

# Windows 上 subprocess 默认按系统 ANSI 编码（中文 = GBK）解码 stdout/stderr，
# 但 grsai CLI 输出 UTF-8（中文 prompt + ANSI 颜色码），GBK 解码会抛 UnicodeDecodeError。
# 显式指定 encoding='utf-8' + errors='replace' 让节点在 Windows 上也稳定运行。
_SUBPROC_KW = dict(
    encoding="utf-8",
    errors="replace",
)


def run_cli(
    cmd: list[str],
    timeout: int = 900,
    label: str = "grsai",
) -> tuple[int, str, str]:
    """运行 grsai CLI 子进程，返回 (returncode, stdout, stderr)。

    - Windows 自动加 CREATE_NO_WINDOW，避免弹 cmd 窗口
    - UTF-8 解码（防 GBK 崩溃）+ errors='replace'（防单字节错误整体抛错）
    - 超时抛 GrsaiCliError（含命令前缀）
    - FileNotFoundError 转 GrsaiCliError（提示装 CLI）
    """
    try:
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
            creationflags=(
                subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
            ),
            **_SUBPROC_KW,
        )
        return result.returncode, result.stdout, result.stderr
    except subprocess.TimeoutExpired as e:
        preview = " ".join(cmd[:6]) + ("..." if len(cmd) > 6 else "")
        raise GrsaiCliError(
            f"{label} CLI 超时（{timeout}s）：{preview}"
        ) from e
    except FileNotFoundError as e:
        raise GrsaiCliError(
            f"未找到 CLI 可执行文件：{cmd[0]}\n"
            f"请确认已全局安装：npm i -g grsai-cli"
        ) from e


def run_cli_with_progress(
    cmd: list[str],
    timeout: int = 900,
    label: str = "grsai",
    node_id: str | None = None,
    on_progress: "callable | None" = None,
) -> tuple[int, str, str]:
    """运行 grsai CLI 子进程，**实时**把 stderr 进度推送到 ComfyUI UI。

    实现方式：
      - subprocess.Popen（不是 run），可以实时读 stderr
      - 起一个 daemon 线程解析每行 stderr
      - 调用 on_progress(text, pct) 回调（如果传了）
      - 节点把 on_progress 接到 PromptServer.send_progress_text

    Args:
        cmd: 命令行参数列表
        timeout: 超时（秒）
        label: 用于错误信息的前缀
        node_id: ComfyUI 节点 ID（用于 send_progress_text；可为 None）
        on_progress: 进度回调，签名 (text: str, pct: float)，pct ∈ [0, 1]

    Returns:
        (returncode, stdout, stderr)
    """
    # 默认 on_progress：如果 node_id 提供了，自动接到 PromptServer
    if on_progress is None and node_id is not None:
        def _default_progress(text: str, pct: float) -> None:
            try:
                from server import PromptServer  # type: ignore
                PromptServer.instance.send_progress_text(text, node_id)
            except Exception:
                # ComfyUI 不可用 / API 变了 —— 静默忽略
                pass
        on_progress = _default_progress

    ansi_re = __import__("re").compile(r"\x1b\[[0-9;]*m")

    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        creationflags=(
            subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
        ),
        **_SUBPROC_KW,
    )

    stderr_lines: list[str] = []

    def _pump_stderr() -> None:
        """后台线程：实时读 stderr，每行推到 UI（去掉 ANSI 颜色码）"""
        assert proc.stderr is not None
        for raw_line in proc.stderr:
            line = raw_line.rstrip("\n")
            stderr_lines.append(line)
            if on_progress is None:
                continue
            # 去掉 ANSI 转义码 + 首尾空白
            clean = ansi_re.sub("", line).strip()
            if clean:
                on_progress(f"[{label}] {clean}", 0.0)

    import threading
    t = threading.Thread(target=_pump_stderr, daemon=True)
    t.start()

    try:
        stdout, stderr = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired as e:
        proc.kill()
        try:
            proc.communicate(timeout=5)
        except Exception:
            pass
        preview = " ".join(cmd[:6]) + ("..." if len(cmd) > 6 else "")
        raise GrsaiCliError(
            f"{label} CLI 超时（{timeout}s）：{preview}"
        ) from e

    t.join(timeout=2)

    if proc.returncode != 0 and not stdout.strip():
        # 非 0 退出 + 无 JSON 输出，转为异常
        preview = " ".join(cmd[:6]) + ("..." if len(cmd) > 6 else "")
        raise GrsaiCliError(
            f"{label} CLI 失败（exit={proc.returncode}）：{preview}\n"
            f"stderr: {''.join(stderr_lines)[-500:]}"
        )

    return proc.returncode, stdout, "".join(stderr_lines)


def cleanup_paths(*paths: str | None) -> None:
    """清理临时文件 / 目录。容忍任意错误（仅清理，不抛）。"""
    for p in paths:
        if not p:
            continue
        try:
            p_obj = Path(p)
            if p_obj.is_dir():
                shutil.rmtree(p_obj, ignore_errors=True)
            elif p_obj.is_file():
                p_obj.unlink(missing_ok=True)
        except Exception:
            pass