# grsai 🎨

> Grsai AI 图像/视频生成命令行工具（TypeScript 版）

`grsai` 是一个面向开发者的 grsai 平台 CLI，把 nano-banana / gpt-image-2 / 2.5 / minimax-h3 等模型的"prompt → 出图 → 落盘"流程压成一行命令。

```bash
grsai banana -p "一只在阳光下打盹的橘猫，水彩风格"
```

> 配套项目：[ai-stdio](../ai-stdio)（Java 版 grsai CLI）、[ai-stdio-py](../ai-stdio-py)（Python 视频生成）。

---

## ✨ 特性

- 🚀 **一行命令**：从提示词到本地 PNG/MP4，中间一切自动化
- 🔌 **多模型**：内置 **nano-banana**、**gpt-image-2 / 2.5**、**minimax-h3（视频）**，后续可扩展
- 🔁 **自动重试**：整个生成流程（提交 + 轮询 + 下载）作为原子单元自动重试 1 次（间隔 500ms，可调）
- ⚡ **并发多图**：`--count N` 一次生成 N 张并发跑（上限 5）
- 🎯 **动态轮询退避**：5/5/10s（可配），匹配任务状态
- 🔐 **统一 API Key**：grsai 平台所有模型共用一个 Key
- 🛡️ **安全覆盖**：默认拒绝覆盖已有文件（对齐 Java 行为），需 `--overwrite` 显式开启
- 🌐 **代理支持**：内置 HTTP/S 代理（适合科研网 / 内网网关）
- 📦 **零运行时依赖污染**：构建后单个 ESM 包，发布即用

---

## 📦 安装

```bash
cd ai-paint
pnpm install
pnpm build

# 本地链接（可选，会创建 `grsai` 全局命令）
pnpm link --global
```

> 也可以直接 `node dist/cli.js` 运行。

---

## ⚙️ 配置

```bash
# 1) 配置 API Key（写入 ~/.grsai/config.json）
grsai config set --api-key sk-xxx

# 2) 设置全局选项
grsai config set --output-dir ./generated
grsai config set --proxy http://127.0.0.1:7890

# 3) 查看当前配置（Key 已脱敏）
grsai config get

# 4) 列出后端 + 全局配置
grsai config list

# 5) 查看配置文件路径
grsai config path
```

API Key 解析优先级：

1. CLI `-k, --api-key`
2. 配置文件 `~/.grsai/config.json` 中的 `apiKey`
3. 环境变量 `GRSAI_API_KEY`
4. 环境变量 `AI_PAINT_API_KEY`（旧名兼容）

---

## 🚀 使用

### banana（grsai nano-banana）

```bash
# 单张
grsai banana -p "赛博朋克夜景" --ratio 16:9 --size 2K -o out.png

# 并发生成 3 张（自动重试 + 自动覆盖已有文件检查）
grsai banana -p "招财猫，写实风格" --count 3 --overwrite -o ./cats/

# 多张参考图（URL 或本地路径均可；本地路径自动转 base64）
grsai banana -p "融合这两张图的风格" -i https://.../a.png -i ./b.png -o merge.png
```

### gpt（grsai gpt-image-2 / 2.5）

```bash
grsai gpt -p "极简 logo" --model gpt-image-2.5 --ratio 1:1 --count 4 -o ./logos/
```

### minimax-h3（grsai 视频生成）

```bash
grsai minimax-h3 \
  -p "电影级写实风格；10s 视频；..." \
  --ratio portrait --resolution 1080p --duration 10 \
  -o ./videos/clip.mp4
```

### 通用选项（所有命令）

| 选项 | 含义 |
|------|------|
| `-n, --count N` | 生成数量（1~5，多张时并发跑） |
| `--overwrite` | 覆盖已存在的输出文件（默认拒绝覆盖） |
| `--poll-intervals "5,5,10"` | 自定义动态轮询间隔（秒，逗号分隔） |
| `--max-wait 600` | 最长等待（秒） |
| `-k, --api-key KEY` | 临时 API Key（覆盖配置） |
| `--proxy URL` | HTTP 代理 |

### 临时指定 Key / 代理

```bash
grsai banana -p "..." -k sk-tmp --proxy http://127.0.0.1:7890
```

---

## 🧑‍💻 开发

```bash
# 安装依赖
pnpm install

# 开发模式（tsx 热更新）
pnpm dev -- banana -p "test"

# 构建
pnpm build

# 类型检查
pnpm typecheck

# Lint
pnpm lint

# 测试
pnpm test
```

### 目录结构

```
ai-paint/
├── src/
│   ├── cli.ts              # CLI 入口
│   ├── index.ts            # 库主入口（供其他包 import）
│   ├── commands/           # 命令实现（generate / edit / config）
│   ├── api/                # 图片生成客户端（Gemini / OpenAI / Registry）
│   ├── utils/              # 工具（http / download / config / logger）
│   └── types/              # 全局类型定义
├── tests/                  # Vitest 测试
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── vitest.config.ts
```

### 扩展新的 profile

1. 在 `src/api/` 下新建 `xxxClient.ts`，继承 `BaseImageClient`
2. 在 `src/api/registry.ts` 的 `BUILTIN_PROFILES` 注册

---

## 📜 License

MIT