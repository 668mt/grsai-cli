"""
grsai-minimax-llm 节点实现

协议：Anthropic Messages API（MiniMax 兼容层）
    POST {llmBaseUrl}/v1/messages
    Headers:
        Authorization: Bearer {llmApiKey}
        Content-Type: application/json
        anthropic-version: 2023-06-01
    Body:
        model: str
        max_tokens: int
        system: str (optional)
        messages: [{role, content: [text|image|...]}]
        temperature: float (optional)
        top_p: float (optional)
        thinking: { type: "adaptive" | "enabled" } (optional, M3 only)

API Key / BaseUrl / Model 全部从 ~/.grsai/config.json 读取：
    llmApiKey, llmBaseUrl, llmModel
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

# 兼容两种安装方式
try:
    from _shared.cli_runner import (
        GrsaiCliError,
        tensor_to_data_url,
    )
except ImportError:
    PARENT = Path(__file__).resolve().parent.parent
    if str(PARENT) not in sys.path:
        sys.path.insert(0, str(PARENT))
    from _shared.cli_runner import (  # type: ignore
        GrsaiCliError,
        tensor_to_data_url,
    )


# MiniMax Anthropic 兼容接口支持的模型（来自官方文档）
MINIMAX_MODELS = [
    "MiniMax-M3",                       # 默认；原生多模态，1M 上下文，支持图片 / 视频
    "MiniMax-M3.1-Flash-Preview",        # M3.1 思考版，强制 thinking
    "MiniMax-M2.7",                      # M2.7 不支持图片 / 视频
    "MiniMax-M2.7-highspeed",
    "MiniMax-M2.5",
    "MiniMax-M2.5-highspeed",
    "MiniMax-M2.1",
    "MiniMax-M2.1-highspeed",
    "MiniMax-M2",
]

# Anthropic 标准 header
ANTHROPIC_VERSION = "2023-06-01"


def _load_llm_config() -> dict[str, str]:
    """从 ~/.grsai/config.json 读 llmApiKey / llmBaseUrl / llmModel。
    文件不存在 / 字段缺失 / JSON 解析失败都不抛错，调用方自己判断。
    """
    env_path = os.environ.get("GRSAI_CONFIG_PATH")
    config_path = Path(env_path) if env_path else Path.home() / ".grsai" / "config.json"
    if not config_path.is_file():
        return {}
    try:
        data = json.loads(config_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError, UnicodeDecodeError):
        return {}
    return {
        k: (v.strip() if isinstance(v, str) else v)
        for k, v in data.items()
        if isinstance(v, str) and v.strip()
    }


class GrsaiMinimaxLLM:
    """MiniMax LLM 节点（Anthropic Messages API 兼容）

    - 支持图片输入（M3 / M3.1-Flash-Preview；M2.x 模型忽略图片）
    - 支持 system prompt
    - 输出：text 字符串（模型回复）+ status 字符串（耗时 / token）
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "prompt": ("STRING", {
                    "multiline": True,
                    "default": "",
                    "tooltip": "用户提示词（必填）",
                }),
                "max_tokens": ("INT", {
                    "default": 1024,
                    "min": 1,
                    "max": 32768,
                    "step": 64,
                    "tooltip": "最大输出 token 数（含思考 token）",
                }),
            },
            "optional": {
                "system_prompt": ("STRING", {
                    "multiline": True,
                    "default": "",
                    "tooltip": "系统提示词（可选，控制模型人设 / 风格）",
                }),
                "image": ("IMAGE", {
                    "tooltip": "可选图片输入（仅 M3 / M3.1-Flash-Preview 支持，M2.x 忽略）",
                }),
                "model": (MINIMAX_MODELS, {
                    "default": "MiniMax-M3",
                    "tooltip": "MiniMax 模型版本（默认从 ~/.grsai/config.json 的 llmModel 读）",
                }),
                "temperature": ("FLOAT", {
                    "default": 1.0,
                    "min": 0.0,
                    "max": 2.0,
                    "step": 0.1,
                    "tooltip": "采样温度 [0, 2]，推荐 1.0；过高输出更随机",
                }),
                "thinking_mode": (["auto", "adaptive", "disabled"], {
                    "default": "auto",
                    "tooltip": "thinking 控制（M3.1-Flash-Preview 强制开启；M2.x 强制开启；M3 默认关闭）\n"
                               "auto: 用模型默认\n"
                               "adaptive: 显式开启（M3 推荐）\n"
                               "disabled: 关闭（仅 M3 支持；M3.1-Flash-Preview 会被传 400）",
                }),
            },
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("text", "status")
    FUNCTION = "generate"
    CATEGORY = "Grsai/LLM"
    OUTPUT_NODE = False

    def generate(
        self,
        prompt: str,
        max_tokens: int,
        system_prompt: str = "",
        image=None,
        model: str = "MiniMax-M3",
        temperature: float = 1.0,
        thinking_mode: str = "auto",
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

        if not prompt or not prompt.strip():
            raise ValueError("grsai-minimax-llm: prompt 必填")

        # 从 ~/.grsai/config.json 读 API Key / BaseUrl / Model
        # （节点不再有 base_url / api_key_override 字段，避免工作流 JSON 泄露密钥）
        cfg = _load_llm_config()
        api_key = cfg.get("llmApiKey", "")
        url_base = cfg.get("llmBaseUrl", "https://api.minimaxi.com/anthropic")
        model_name = model or cfg.get("llmModel", "MiniMax-M3")

        if not api_key:
            raise ValueError(
                "grsai-minimax-llm: 未配置 API Key。\n"
                "请在 ~/.grsai/config.json 设置 llmApiKey：\n"
                "  grsai config set --llm-api-key sk-xxx"
            )

        # 构建 messages
        user_content: list[dict] = []
        if image is not None:
            try:
                data_url = tensor_to_data_url(image, media_type="image/png")
                user_content.append({
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/png",
                        "data": data_url.split(",", 1)[1],  # 去前缀，Anthropic 只要 base64 字符串
                    },
                })
            except Exception as e:
                raise GrsaiCliError(
                    f"grsai-minimax-llm: 图片转 base64 失败：{e}"
                ) from e
        user_content.append({"type": "text", "text": prompt.strip()})

        body: dict = {
            "model": model_name,
            "max_tokens": int(max_tokens),
            "messages": [{"role": "user", "content": user_content}],
        }
        if system_prompt and system_prompt.strip():
            body["system"] = system_prompt.strip()
        if temperature is not None:
            body["temperature"] = float(temperature)

        # thinking 控制（仅 M3 系列生效；M2.x 始终开启，禁用 ignored）
        if thinking_mode != "auto" and model_name.startswith("MiniMax-M3"):
            if thinking_mode == "adaptive":
                body["thinking"] = {"type": "adaptive"}
            elif thinking_mode == "disabled":
                # M3.1-Flash-Preview 会返回 400
                body["thinking"] = {"type": "disabled"}

        # 调 API
        import requests
        url = f"{url_base.rstrip('/')}/v1/messages"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "anthropic-version": ANTHROPIC_VERSION,
        }

        _push_status(f"[grsai-minimax-llm] 提交 {model_name}（{len(user_content)} 个 content blocks）...")

        try:
            resp = requests.post(
                url,
                json=body,
                headers=headers,
                timeout=300,
            )
        except requests.RequestException as e:
            elapsed = _time.monotonic() - start_time
            _push_status(f"[grsai-minimax-llm] FAIL {elapsed:.1f}s: 网络错误 {e}")
            raise GrsaiCliError(f"grsai-minimax-llm: 网络错误：{e}") from e

        elapsed = _time.monotonic() - start_time

        # 解析响应
        if resp.status_code != 200:
            err_body = resp.text[:500]
            _push_status(f"[grsai-minimax-llm] FAIL {elapsed:.1f}s: HTTP {resp.status_code}")
            raise GrsaiCliError(
                f"grsai-minimax-llm: HTTP {resp.status_code}\n"
                f"  URL: {url}\n"
                f"  Body: {body}\n"
                f"  Response: {err_body}"
            )

        try:
            data = resp.json()
        except json.JSONDecodeError as e:
            raise GrsaiCliError(
                f"grsai-minimax-llm: 解析 JSON 失败：{e}\n"
                f"Response: {resp.text[:500]}"
            ) from e

        # 提取所有 text 块（跳过 thinking）
        content_blocks = data.get("content", [])
        text_parts = []
        thinking_parts = []
        for block in content_blocks:
            block_type = block.get("type")
            if block_type == "text":
                text_parts.append(block.get("text", ""))
            elif block_type == "thinking":
                thinking_parts.append(block.get("thinking", ""))

        text_output = "\n".join(text_parts).strip()
        if not text_output and thinking_parts:
            # 仅 thinking 没 text 时，避免空输出
            text_output = "（模型只输出了思考过程，未生成文本）"

        # usage 统计
        usage = data.get("usage", {})
        in_tokens = usage.get("input_tokens", "?")
        out_tokens = usage.get("output_tokens", "?")
        stop_reason = data.get("stop_reason", "?")

        status = (
            f"OK {elapsed:.1f}s · {in_tokens}→{out_tokens} tokens · {stop_reason}"
        )
        _push_status(f"[grsai-minimax-llm] {status}")
        return (text_output, status)