---
name: grsai-cli
description: |
  grsai 平台的命令行工具（grsai CLI）。用于从终端生成图片和视频，支持 nano-banana / gpt-image-2/2.5 / minimax-h3 三类模型，
  自动轮询、自动重试、自动并发、自动下载到本地。当用户提到「grsai」「grsai-cli」「画图」「画一张」「生成视频」
  「banana」「gpt-image」「minimax-h3」「nano-banana」时使用本 skill。
---

# grsai CLI

`grsai` 是 grsai 平台（图像 / 视频生成 API）的 TypeScript CLI 工具，把"提示词 → 出图 → 落盘"压成一行命令。

## 何时使用

- 用户要生成图片（写实 / 插画 / 设计 / 头像 等）
- 用户要生成视频（电影感、延时摄影、动态镜头）
- 用户希望带参考图（i2i）做风格 / 人物 / 服装迁移
- 用户希望批量并发生成同一 prompt 的多个变体
- 用户希望 agent 改写 prompt 后再生成（中文 → 优化后的中文）

## 运行方式

```bash
# 首次使用：配置 grsai API Key
grsai config set --api-key sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxx

# 想用 agent 改写提示词（可选）
grsai config set --llm-api-key sk-xxx
grsai config set --llm-base-url https://api.minimaxi.com/anthropic
grsai config set --llm-model MiniMax-M3

# 生成图片（单张）
grsai banana -p "招财猫，写实风格" -o ./cats/cat.png

# 生成图片（多张，1~5 并发）
grsai banana -p "招财猫" --count 3 --overwrite -o ./cats/

# 生成视频
grsai minimax-h3 -p "夜晚街道延时摄影，10秒" \
  --ratio portrait --resolution 768p --duration 6 \
  -o ./videos/clip.mp4

# 带参考图（人物 + 服饰 多图参考）
grsai banana -p "25岁亚洲女生，正面站立..." \
  --model nano-banana-2 --ratio 9:16 --size 2K \
  -i /path/to/person.png -i /path/to/clothes.png \
  -o ./output/白天-酒店-如烟.png

# 启动 Web 调试界面（React + Vite 前端 + 后端 API）
grsai web   # 浏览器访问 http://localhost:5173
```

## 子命令一览

| 子命令 | 用途 | 典型耗时 |
|--------|------|----------|
| `grsai banana` | nano-banana 系列图片生成（nano-banana-2 / -fast / -pro 等） | 30-60s |
| `grsai gpt` | gpt-image-2 / 2.5 系列图片生成 | 60-120s |
| `grsai minimax-h3` | 视频生成（portrait/landscape，480p/768p/1080p，1~15s） | 2-5min |
| `grsai web` | 启动 Web 调试界面（React + Vite） | 持续 |
| `grsai config` | 管理 API Key / 输出目录 / LLM 配置 | - |
| `grsai install` | 安装内置 skill 到全局目录 | - |

## 关键参数（所有子命令通用）

| 参数 | 含义 |
|------|------|
| `-p, --prompt <text>` | 提示词（必填） |
| `-o, --output <path>` | 输出文件或目录（中文文件名支持） |
| `-n, --count <n>` | 生成数量，1~5（并发） |
| `-i, --input <file>` | 参考图（可多次，本地路径自动转 base64） |
| `-k, --api-key <key>` | 临时覆盖 API Key |
| `--retry <n>` | 重试次数（默认 2） |
| `--overwrite` | 覆盖已存在的输出文件 |

模型特定参数（示例）：

| 后端 | 关键参数 |
|------|---------|
| banana | `--model nano-banana-2 / -fast / -pro`、`--ratio 1:1/16:9/9:16/...`、`--size 1K/2K/4K` |
| gpt-image | `--model gpt-image-2 / 2.5`、`--ratio 1024x1024/1:1/...`、`--quality auto/medium/high` |
| minimax-h3 | `--ratio portrait/landscape`、`--resolution 480p/768p/1080p`、`--duration 1~15` |

## default 行为

- **重试**：默认 2 次（总共尝试 3 次），所有错误都会重试（含内容审核违规）
- **超时**：单次 HTTP 10 分钟；轮询总超时 10 分钟（max-wait 可改）
- **轮询退避**：`[5, 5, 10]` 秒（轮询间隔随时间拉长）
- **覆盖保护**：默认拒绝覆盖已存在文件，需加 `--overwrite`
- **输出目录**：`outputDir` 未设置时输出到当前路径
- **历史**：CLI 不持久化历史（web 子命令会存 `~/.grsai/web-history.json`）

## 输出文件命名

`-o` 既可指定文件路径也可指定目录：
- 指定文件（如 `-o ./out/cat.png`）：直接保存到该路径
- 指定目录（如 `-o ./out/`）：自动用 UUID + 扩展名命名（count>1 时附加 `-1` `-2`）
- **支持中文文件名**（Windows / macOS / Linux 均 OK）

## 最佳实践

1. **prompt 用中文也支持**：grsai 后端模型（nano-banana / gpt-image）虽然是基于 Gemini / GPT，但对中文 prompt 也可工作；视频模型（MiniMax-M3）中文理解更佳
2. **agent 改写 prompt**：配置 LLM_API_KEY 后，agent 会根据后端 / 模型 / 比例 / 尺寸等参数生成 3 个候选变体供选择
3. **参考图传 dataUrl**：上传参考图后前端传 dataUrl 数组给 grsai（grsai 在云端，访问不到 localhost）
4. **重试是默认行为**：内容违规也会重试（grsai 偶发波动），不需要 `--retry`
5. **删除本地图片很危险**：`~/.grsai/` 下存的是 API Key / 输出文件，rm 前请确认