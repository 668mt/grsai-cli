"""
grsai-gpt：ComfyUI 节点 —— 调用 grsai gpt-image-2 / 2.5 系列生成图片。

安装：
    cp -r comfyui-nodes/grsai-gpt  ComfyUI/custom_nodes/

依赖：
    pip install requests torch pillow numpy
"""
from .nodes import GrsaiGptImage

NODE_CLASS_MAPPINGS = {
    "GrsaiGptImage": GrsaiGptImage,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "GrsaiGptImage": "Grsai GPT Image 🎨",
}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]