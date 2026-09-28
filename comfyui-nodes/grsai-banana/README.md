# Grsai Banana (ComfyUI 节点)

调用 **grsai nano-banana** 系列生成图片。

对应 CLI：`grsai banana -p "..."`

## 安装

```bash
# 1. 把整个目录复制到 ComfyUI 的 custom_nodes
cp -r comfyui-nodes/grsai-banana  ComfyUI/custom_nodes/

# 或符号链接（推荐，改完即生效）
ln -s $(pwd)/comfyui-nodes/grsai-banana  ComfyUI/custom_nodes/grsai-banana

# 2. 安装依赖
pip install requests torch pillow numpy

# 3. 重启 ComfyUI
```

## API Key 配置

三种方式（优先级从高到低）：

1. 节点输入框的 `api_key` 字段
2. 环境变量 `GRSAI_API_KEY`
3. （无） —— 会报错

## 节点参数

### 必填

| 参数 | 类型 | 说明 |
|------|------|------|
| `prompt` | STRING | 提示词（多行） |
| `ratio` | COMBO | 1:1 / 3:4 / 4:3 / 9:16 / 16:9 / auto |
| `size` | COMBO | 1K / 2K / 4K |
| `model` | COMBO | nano-banana-2（默认）/ nano-banana / nano-banana-fast / nano-banana-pro-4k-vip |
| `count` | INT | 生成张数 1~5（并发请求） |
| `api_key` | STRING | 留空走环境变量 |

### 可选

| 参数 | 类型 | 说明 |
|------|------|------|
| `image1` | IMAGE | 参考图 1（自动转 base64） |
| `image2` | IMAGE | 参考图 2（自动转 base64） |

## 输出

`IMAGE` —— shape `[count, H, W, 3]`，float32，范围 `[0, 1]`，可直接接 `Preview Image` / `VAE Decode` / `Save Image`。

## 示例工作流

```
GrsaiBanana → Preview Image
```

或多张参考图：

```
Load Image ──┐
             ├→ GrsaiBanana → Preview Image
Load Image ──┘
```