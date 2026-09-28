"""
grsai-minimax-h3：ComfyUI 节点 —— 调用 grsai minimax-h3 生成视频。

安装：
    cp -r comfyui-nodes/grsai-minimax-h3  ComfyUI/custom_nodes/

依赖：
    pip install requests torch pillow numpy
"""
from .nodes import GrsaiMinimaxH3

NODE_CLASS_MAPPINGS = {
    "GrsaiMinimaxH3": GrsaiMinimaxH3,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "GrsaiMinimaxH3": "Grsai Minimax H3 🎬",
}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]