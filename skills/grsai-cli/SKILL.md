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
grsai banana -p "橘黄色的小猫..." \
  --model nano-banana-2 --ratio 9:16 --size 2K \
  -i /path/to/cat.png -i /path/to/clothes.png \
  -o ./output/小猫.png

## 子命令一览

| 子命令 | 用途 | 典型耗时 |
|--------|------|----------|
| `grsai banana` | nano-banana 系列图片生成（nano-banana-2 / -fast / -pro 等） | 30-60s |
| `grsai gpt` | gpt-image-2 / 2.5 系列图片生成 | 60-120s |
| `grsai minimax-h3` | 视频生成（portrait/landscape，480p/768p/1080p，1~15s） | 2-5min |
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

## 各后端参数详解

### `banana`（nano-banana 系列图片生成）

**必填**：`-p, --prompt`

**专属参数**：

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `--model` | enum | `nano-banana-2` | 模型：`nano-banana` / `nano-banana-fast` / `nano-banana-2` / `nano-banana-2-cl` / `nano-banana-pro` / `nano-banana-pro-vt` / `nano-banana-pro-cl` / `nano-banana-pro-vip` / `nano-banana-pro-4k-vip` |
| `--ratio` | enum | `1:1` | 宽高比：`1:1` / `4:3` / `3:4` / `3:2` / `2:3` / `5:4` / `4:5` / `9:16` / `16:9` / `21:9` / `auto`；**nano-banana-2 系列额外支持** `1:4` / `4:1` / `1:8` / `8:1` |
| `--size` | enum | `1K` | 分辨率：`1K` / `2K` / `4K` |

**示例**：

```bash
# 单张
grsai banana -p "..." -o ./out.png

# 多张并发 + 覆盖
grsai banana -p "..." --count 3 --overwrite -o ./out/

# 带参考图 + 自定义模型
grsai banana -p "..." --model nano-banana-pro --ratio 16:9 --size 2K \
  -i ./person.png -o ./out/result.png
```

---

### `gpt`（gpt-image-2 / 2.5 系列图片生成）

**必填**：`-p, --prompt`

**专属参数**：

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `--model` | enum | `gpt-image-2.5` | 模型：`gpt-image-2` / `gpt-image-2-vip` / `gpt-image-2.5` / `gpt-image-2.5-flare` / `gpt-image-2.5-sunburst` |
| `--ratio` | string | `1024x1024` | 比例（如 `1:1` / `16:9` / `9:16`）**或**像素值（如 `1024x1536` / `2048x2048` / `3840x2160`） |
| `--quality` | enum | `auto` | 质量档：`auto` / `low` / `medium` / `high` / `xhigh` / `max` |
| `--background` | enum | — | 仅支持 `transparent`；仅 `gpt-image-2-vip` / `2.5-flare` / `2.5-sunburst` 可用 |
| `--mask` | url | — | 蒙版图片 URL |

**模型能力矩阵**：

| 模型 | ratio 接受 | quality 接受 |
|------|-----------|-------------|
| `gpt-image-2` | 比例 或 1K 像素值 | `auto` |
| `gpt-image-2-vip` | 仅像素值（1K~4K） | `medium` |
| `gpt-image-2.5` | 比例 或 1K 像素值 | `auto` |
| `gpt-image-2.5-flare` | 仅像素值（1K~4K） | `low` / `medium` / `high` |
| `gpt-image-2.5-sunburst` | 仅像素值（1K~4K） | `low` / `medium` / `high` / `xhigh` / `max` |

**示例**：

```bash
grsai gpt -p "极简 logo" --model gpt-image-2.5 --ratio 1:1 --quality high \
  -o ./out/logo.png

grsai gpt -p "..." --model gpt-image-2.5-sunburst --ratio 3840x2160 \
  --quality max --background transparent -o ./hd.png
```

---

### `minimax-h3`（视频生成）

**必填**：`-p, --prompt`、`--ratio`、`--resolution`、`--duration`

**专属参数**：

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `--ratio` | enum | — | 画幅方向（**必填**）：`portrait` / `landscape` |
| `--resolution` | enum | — | 视频分辨率（**必填**）：`480p` / `768p` / `1080p` |
| `--duration` | number | — | 视频时长（**必填**，秒）：`1` ~ `15`，**1080p 最大 10 秒** |
| `--input` | file[] | — | 参考图（URL 或本地路径，最多 **9** 张） |
| `--audio` | file[] | — | 参考音频（URL 或 base64，最多 **3** 个） |
| `--seed` | number | — | 随机种子（任意整数） |

**示例**：

```bash
# 6 秒视频 + 1 张参考图
grsai minimax-h3 -p "夜晚街道延时摄影" \
  --ratio portrait --resolution 768p --duration 6 \
  -i ./street.png -o ./videos/clip.mp4

# 1080p 高清视频（最长 10 秒）
grsai minimax-h3 -p "..." --ratio landscape --resolution 1080p --duration 10 \
  -o ./videos/hd.mp4

# 多张并发
grsai minimax-h3 -p "..." --ratio portrait --resolution 768p --duration 4 \
  --count 3 --overwrite -o ./out/

# 带音频参考
grsai minimax-h3 -p "..." --ratio landscape --resolution 768p --duration 6 \
  --audio https://example.com/bgm.mp3 -o ./videos/clip.mp4
```

## default 行为

- **重试**：默认 2 次（总共尝试 3 次），所有错误都会重试（含内容审核违规）
- **超时**：单次 HTTP 10 分钟；轮询总超时 10 分钟（max-wait 可改）
- **覆盖保护**：默认拒绝覆盖已存在文件，需加 `--overwrite`
- **输出目录**：`outputDir` 未设置时输出到当前路径

## 输出文件命名

`-o` 既可指定文件路径也可指定目录：
- 指定文件（如 `-o ./out/cat.png`）：直接保存到该路径
- 指定目录（如 `-o ./out/`）：自动用 UUID + 扩展名命名（count>1 时附加 `-1` `-2`）