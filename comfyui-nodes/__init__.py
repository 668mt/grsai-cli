"""
comfyui-nodes：grsai 平台的 ComfyUI 节点集合。

本目录的 **每个子目录** 都是一个独立的 ComfyUI 节点，
可以单独复制或符号链接到 ComfyUI/custom_nodes/。

子目录结构：
    _shared/
        grsai_client.py        通用任务客户端（Python 版 GrsaiTaskRunner）
    grsai-banana/              nano-banana 图像生成
    grsai-gpt/                 gpt-image-2 / 2.5 图像生成
    grsai-minimax-h3/          minimax-h3 视频生成

不要把整个 comfyui-nodes/ 复制到 ComfyUI/custom_nodes/，
否则 ComfyUI 会尝试加载 _shared/grsai_client.py 这个非节点模块并报警。
"""