"""
grsai-banana：ComfyUI 节点 —— 调用 grsai nano-banana 系列生成图片。

安装：
    cp -r comfyui-nodes/grsai-banana  ComfyUI/custom_nodes/
    # 或符号链接，方便改完直接刷新 ComfyUI
    ln -s /path/to/comfyui-nodes/grsai-banana  ComfyUI/custom_nodes/grsai-banana

依赖：
    pip install requests torch pillow numpy
"""
from .nodes import GrsaiBanana

NODE_CLASS_MAPPINGS = {
    "GrsaiBanana": GrsaiBanana,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "GrsaiBanana": "Grsai Banana 🍌",
}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]