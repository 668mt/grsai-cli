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
from typing import NamedTuple

import torch
from PIL import Image


# ---------------- grsai 包装：绕开 .cmd / %* 的引号 bug ----------------

class GrsaiCmd(NamedTuple):
    """节点调 grsai CLI 的可执行前缀。

    Windows 的 grsai.cmd wrapper 用 `%*` 传递参数，会被空格分割 prompt，
    导致带空格的 prompt 被截断。绕开办法：直接用 node + dist/cli.js，
    subprocess.Popen 不会做 shell 解析，参数完整。
    """
    exe: str         # 'node' 或 node.exe 绝对路径
    script: str      # dist/cli.js 绝对路径

    def to_argv(self, args: list[str]) -> list[str]:
        """构造完整的 subprocess argv（绕过 .cmd wrapper）"""
        return [self.exe, self.script, *args]


def find_grsai_cli() -> GrsaiCmd:
    """定位 grsai CLI 的 node 可执行文件和 cli.js 脚本路径。

    不返回 .cmd wrapper 路径（Windows 的 %* 处理会破坏带空格的参数）。
    直接返回 node + cli.js，subprocess.Popen 不会做 shell 解析，参数完整。
    """
    candidates: list[Path] = []
    cli_js: Path | None = None

    # 1) 从 shutil.which("grsai") 找 .cmd / sh 路径 → 反推 dist/cli.js 位置
    found = shutil.which("grsai")
    if found:
        candidates.append(Path(found))

    # 2) Windows 全局 npm 路径下的 grsai.cmd
    if sys.platform == "win32":
        npm_prefix = os.environ.get("npm_config_prefix", "")
        if npm_prefix:
            candidates.append(Path(npm_prefix) / "grsai.cmd")
        candidates.extend([
            Path("D:/npm/grsai.cmd"),
            Path("C:/npm/grsai.cmd"),
        ])

    # 从候选 .cmd 找对应的 dist/cli.js
    # npm 安装的 cli.js 总是放在 <prefix>/node_modules/grsai-cli/dist/cli.js
    for cand in candidates:
        if not cand.is_file():
            continue
        parent = cand.parent  # D:/npm
        js_path = parent / "node_modules" / "grsai-cli" / "dist" / "cli.js"
        if js_path.is_file():
            cli_js = js_path
            break

    # 3) 项目当前 / 上级目录找 dist/cli.js（源码运行场景）
    if cli_js is None:
        here = Path(__file__).resolve().parent  # _shared/
        for ancestor in [
            here.parent.parent / "dist" / "cli.js",  # <repo>/dist/cli.js
            here.parent.parent.parent / "dist" / "cli.js",  # <parent>/dist/cli.js
        ]:
            if ancestor.is_file():
                cli_js = ancestor
                break

    if cli_js is None:
        raise GrsaiCliError(
            "未找到 grsai CLI dist/cli.js。\n"
            "请确认全局安装：npm i -g grsai-cli\n"
            "或源码构建：pnpm build\n"
            "安装完后 `grsai --version` 应该能跑通"
        )

    # 找 node 可执行文件
    if sys.platform == "win32":
        # 优先用 cli.cmd 旁边的 node.exe（npm 安装路径）
        # npm 安装时 node.exe 通常在 <prefix>/node.exe
        prefix_parent = cli_js.parent.parent.parent  # <npm_prefix>/
        candidate_node = prefix_parent / "node.exe"
        if candidate_node.is_file():
            node_exe = str(candidate_node)
        else:
            node_exe = shutil.which("node") or shutil.which("node.exe") or "node"
    else:
        node_exe = shutil.which("node") or "node"

    return GrsaiCmd(exe=node_exe, script=str(cli_js))


class GrsaiCliError(RuntimeError):
    pass


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

    Args:
        cmd: 子命令 + 参数（如 `['banana', '-p', '...', '--json']`）
        timeout: 超时秒数
        label: 错误信息前缀

    自动调用 find_grsai_cli() 拿到 node + cli.js，绕过 .cmd wrapper 的 %* bug。
    """
    grsi = find_grsai_cli()
    argv = grsi.to_argv(cmd)
    try:
        result = subprocess.run(
            argv,
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
        preview = " ".join(argv[:6]) + ("..." if len(argv) > 6 else "")
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

    grsi = find_grsai_cli()
    argv = grsi.to_argv(cmd)
    proc = subprocess.Popen(
        argv,
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
        preview = " ".join(argv[:6]) + ("..." if len(argv) > 6 else "")
        raise GrsaiCliError(
            f"{label} CLI 超时（{timeout}s）：{preview}"
        ) from e

    t.join(timeout=2)

    if proc.returncode != 0 and not stdout.strip():
        # 非 0 退出 + 无 JSON 输出，转为异常
        preview = " ".join(argv[:6]) + ("..." if len(argv) > 6 else "")
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