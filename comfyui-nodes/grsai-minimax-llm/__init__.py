"""
grsai-minimax-llm：ComfyUI 节点 —— 调用 MiniMax (MiniMax) LLM，支持图片输入

协议：Anthropic Messages API（用户配置在 ~/.grsai/config.json）
    - llmApiKey     API Key
    - llmBaseUrl    e.g. https://api.minimaxi.com/anthropic
    - llmModel      e.g. MiniMax-M3 / MiniMax-M3.1-Flash-Preview

安装：
    cp -r comfyui-nodes/grsai-minimax-llm  ComfyUI/custom_nodes/

依赖：comfyui-nodes/_shared/ 已有；本节点只依赖标准库 + requests
"""
from .nodes import GrsaiMinimaxLLM

NODE_CLASS_MAPPINGS = {
    "GrsaiMinimaxLLM": GrsaiMinimaxLLM,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "GrsaiMinimaxLLM": "Grsai Minimax LLM 💬",
}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]