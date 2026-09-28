# Grsai GPT Image (ComfyUI 节点)

调用 **grsai gpt-image-2 / 2.5** 系列生成图片。

对应 CLI：`grsai gpt -p "..."`

## 安装

```bash
cp -r comfyui-nodes/grsai-gpt  ComfyUI/custom_nodes/
pip install requests torch pillow numpy
```

## API Key 配置

1. 节点 `api_key` 输入框
2. 环境变量 `GRSAI_API_KEY`

## 节点参数

### 必填

| 参数 | 类型 | 说明 |
|------|------|------|
| `prompt` | STRING | 提示词（多行） |
| `model` | COMBO | gpt-image-2.5（默认）/ gpt-image-2 / gpt-image-2-vip / gpt-image-2.5-flare / gpt-image-2.5-sunburst |
| `ratio` | COMBO | 1:1 / 3:2 / 2:3 / auto |
| `quality` | COMBO | auto / low / medium / high |
| `background` | COMBO | auto / transparent / opaque |
| `count` | INT | 生成张数 1~5（并发请求） |
| `api_key` | STRING | 留空走环境变量 |

### 可选

| 参数 | 类型 | 说明 |
|------|------|------|
| `image1` | IMAGE | 参考图（自动转 base64） |
| `mask` | MASK | 编辑蒙版（自动转 base64 PNG） |

## 输出

`IMAGE` —— shape `[count, H, W, 3]`，float32，范围 `[0, 1]`。

## 特色

- 支持 **transparent 背景**：可生成去背 PNG，搭配 `Image Composite Mask` 工作流
- 支持 **mask 编辑**：把任意 MASK 节点连进来即可做局部重绘
- 支持 **flare / sunburst 变体模型**：风格化生成