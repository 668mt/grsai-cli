# Grsai Minimax H3 (ComfyUI 节点)

调用 **grsai minimax-h3** 生成视频（10~15s MP4）。

对应 CLI：`grsai minimax-h3 -p "..."`

## 安装

```bash
cp -r comfyui-nodes/grsai-minimax-h3  ComfyUI/custom_nodes/
pip install requests torch pillow numpy

# 可选：用于提取首帧预览（推荐）
pip install imageio[ffmpeg]
# 或确保系统 ffmpeg 在 PATH 中
```

## API Key 配置

1. 节点 `api_key` 输入框
2. 环境变量 `GRSAI_API_KEY`

## 节点参数

### 必填

| 参数 | 类型 | 说明 |
|------|------|------|
| `prompt` | STRING | 视频描述提示词（多行） |
| `ratio` | COMBO | portrait（竖屏）/ landscape（横屏） |
| `resolution` | COMBO | 480p / 768p / 1080p |
| `duration` | INT | 视频时长（1~15 秒；1080p ≤ 10） |
| `api_key` | STRING | 留空走环境变量 |

### 可选

| 参数 | 类型 | 说明 |
|------|------|------|
| `image1` | IMAGE | 参考图 1（最多 9 张） |
| `image2` | IMAGE | 参考图 2 |
| `seed` | INT | 随机种子（0 = 不指定） |

## 输出

| 输出 | 类型 | 说明 |
|------|------|------|
| `video_path` | STRING | 保存到 `<ComfyUI>/output/grsai_<timestamp>_0.mp4` 的绝对路径 |
| `preview_frame` | IMAGE | 视频第一帧（用 ffmpeg / imageio 提取，方便预览） |

## 后处理建议

下游节点用 `video_path` 字符串接入：

```
GrsaiMinimaxH3.video_path → VHS_LoadVideo → ...
```

> ⚠️ VHS 是 ComfyUI-VideoHelperSuite 插件提供的节点组。如果你装了它，直接连进去即可。

## 输出目录

默认保存到：
- `<ComfyUI>/output/grsai_*.mp4`

可通过环境变量自定义：`COMFYUI_OUTPUT_DIR=/path/to/dir`

## 限制

- 视频生成通常需要 **1~5 分钟**（视分辨率 / 时长），节点会阻塞等待
- 单次最多 15 秒（1080p 限 10 秒）
- 最多 9 张参考图