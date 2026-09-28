# ComfyUI Nodes for grsai

把 grsai 平台的 **nano-banana** / **gpt-image-2 / 2.5** / **minimax-h3** 接入 ComfyUI 工作流。

## 节点列表

| 节点 | ComfyUI 中显示 | 对应 CLI | 输出类型 |
|------|----------------|----------|----------|
| `grsai-banana/` | **Grsai Banana 🍌** | `grsai banana` | `IMAGE` |
| `grsai-gpt/` | **Grsai GPT Image 🎨** | `grsai gpt` | `IMAGE` |
| `grsai-minimax-h3/` | **Grsai Minimax H3 🎬** | `grsai minimax-h3` | `STRING` + `IMAGE`（视频路径 + 首帧） |

## 一键安装（推荐）

```bash
# 进入 ComfyUI 目录
cd /path/to/ComfyUI

# 符号链接所有节点（开发友好，改完代码不用重装）
ln -s /path/to/grsai-cli/comfyui-nodes/grsai-banana          custom_nodes/grsai-banana
ln -s /path/to/grsai-cli/comfyui-nodes/grsai-gpt             custom_nodes/grsai-gpt
ln -s /path/to/grsai-cli/comfyui-nodes/grsai-minimax-h3      custom_nodes/grsai-minimax-h3

# 或复制（部署友好）
# cp -r /path/to/grsai-cli/comfyui-nodes/grsai-banana          custom_nodes/
# cp -r /path/to/grsai-cli/comfyui-nodes/grsai-gpt             custom_nodes/
# cp -r /path/to/grsai-cli/comfyui-nodes/grsai-minimax-h3      custom_nodes/

# 安装依赖
pip install requests torch pillow numpy
# 可选（用于提取视频首帧预览）：
pip install imageio[ffmpeg]

# 重启 ComfyUI
```

## 目录结构

```
comfyui-nodes/
├── README.md                         本文件
├── _shared/
│   └── grsai_client.py               通用任务客户端（提交 + 动态轮询 + 错误处理）
│                                       对齐 src/api/grsai-runner.ts
│
├── grsai-banana/                     nano-banana 节点
│   ├── __init__.py                   NODE_CLASS_MAPPINGS 注册入口
│   ├── nodes.py                      GrsaiBanana 实现
│   └── README.md                     节点文档
│
├── grsai-gpt/                        gpt-image-2/2.5 节点
│   ├── __init__.py
│   ├── nodes.py                      GrsaiGptImage 实现
│   └── README.md
│
└── grsai-minimax-h3/                 minimax-h3 视频节点
    ├── __init__.py
    ├── nodes.py                      GrsaiMinimaxH3 实现
    └── README.md
```

## 与 CLI 的协议一致性

所有节点共用 `_shared/grsai_client.py`，与 CLI 端的 `src/api/grsai-runner.ts` 行为对齐：

| 维度 | CLI (TypeScript) | 节点 (Python) |
|------|------------------|---------------|
| 提交端点 | `POST {baseUrl}/v1/api/generate` | 同 |
| 轮询端点 | `GET {baseUrl}/v1/api/result?id=...` | 同 |
| 鉴权 | `Authorization: Bearer <key>` | 同 |
| 轮询退避 | `[5, 5, 10]` 秒（首次 5s，后两次各 5s、10s） | 同 |
| 最大等待 | 600 秒 | 同 |
| 状态机 | `running` / `succeeded` / `failed` / `violation` | 同 |
| 业务 code=-22 | 任务不存在，立即抛错 | 同 |
| 失败信息 | 含 `failureReason` / `error` / `tips` | 同 |
| API Key 解析 | CLI > 配置文件 > env `GRSAI_API_KEY` | 节点输入框 > env `GRSAI_API_KEY` |

## API Key 配置

**推荐**：在 shell 里 export，避免每个节点都填：

```bash
export GRSAI_API_KEY="sk-xxxxxxxxxxxxxxxxxxxxxxxxxx"
```

或在节点输入框里临时填（优先级更高）。

## 常见问题

### Q: 节点没出现在 ComfyUI 菜单？

```bash
# 看 ComfyUI 启动日志，搜 "Grsai"
# 如果看到 "Failed to import"，说明 _shared 没找到：
#   → 确认 comfyui-nodes/grsai-banana/nodes.py 的 try/except fallback 路径正确
#   → 或者把 _shared/ 复制到 custom_nodes/ 旁边
```

### Q: 中文文件名 / 路径乱码？

Windows 下 ComfyUI 默认编码可能是 GBK。本目录所有 Python 文件已声明 `# -*- coding: utf-8 -*-` 顶部（通过文件头注释），但如果还有问题，在 ComfyUI 启动脚本里加：
```bash
set PYTHONIOENCODING=utf-8
```

### Q: 视频节点首帧是黑图？

说明 ffmpeg 没装。装一下：
```bash
# Ubuntu/Debian
sudo apt install ffmpeg
# Windows (chocolatey)
choco install ffmpeg
# 或 Python 包
pip install imageio[ffmpeg]
```

### Q: 想加新节点？

1. 在 `comfyui-nodes/` 下新建目录 `grsai-<model>/`
2. 复制 `grsai-banana/` 作为模板
3. 在 `nodes.py` 改 payload 字段（参考 TS 端 `src/api/<model>.ts` 的 `buildPayload`）
4. 复用 `_shared/grsai_client.py` 即可，不用重新实现轮询逻辑

## License

MIT © Martin