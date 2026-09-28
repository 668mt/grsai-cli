<div align="center">

# grsai-cli

**One-line CLI for grsai image & video generation**

把 nano-banana / gpt-image-2(2.5) / minimax-h3 等模型的「prompt → 出图/视频 → 落盘」压成一行命令。

[![npm version](https://img.shields.io/npm/v/grsai-cli?style=flat-square)](https://www.npmjs.com/package/grsai-cli)
[![npm downloads](https://img.shields.io/npm/dm/grsai-cli?style=flat-square)](https://www.npmjs.com/package/grsai-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](./LICENSE)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)

[English](./README.en.md) · [快速开始](#-quick-start) · [安装](#-installation) · [使用](#-usage) · [开发](#-development)

</div>

---

## ✨ Features

- 🚀 **一行命令出图**：从提示词到本地 PNG/MP4，submit + poll + download 全自动
- 🎨 **多模型开箱即用**：`nano-banana`（图像）/ `gpt-image-2` & `2.5`（图像）/ `minimax-h3`（视频）
- ⚡ **并发多图**：`--count N` 一次生成 N 张并发跑（上限 5）
- 🔁 **自动重试**：整个生成流程作为原子单元自动重试，可配置退避策略
- 🎯 **动态轮询**：`5s → 5s → 10s` 阶梯退避，与 grsai 平台任务状态匹配
- 🛡️ **安全覆盖**：默认拒绝覆盖已有文件（对齐 Java 版行为），需 `--overwrite` 显式开启
- 🌐 **代理友好**：内置 HTTP/S 代理，支持科研网 / 内网网关
- 🔌 **可扩展**：新增模型只需实现一个 `BaseImageClient` 子类
- 🧰 **Web 调试台**：`pnpm dev` 一条命令启动 React + Vite 前端 + Hono 后端 + tsx watch
- 🤖 **Agent Skill**：`grsai install` 把内置 skill 装到 `~/.agents/skills/`，无缝集成 Claude Code 等 agent

---

## 🚀 Quick Start

零依赖、一行体验（不需要 clone，不需要 build）：

```bash
npx -y grsai-cli@latest install
```

然后配置 API Key：

```bash
grsai config set --api-key sk-xxx
```

跑一条命令试试：

```bash
grsai banana -p "在阳光下打盹的橘猫，水彩风格" -o cat.png
```

> 💡 `install` 子命令会把内置 skill 装到 `~/.agents/skills/`，方便你的 agent 自动识别本工具。
> 想用 `grsai` 命令而非 `npx`？见下方 [📦 Installation](#-installation)。

---

## 📦 Installation

### 方式一：npm 全局安装（推荐）

```bash
npm i -g grsai-cli
grsai --version   # 期望输出 0.1.0 或更新版本
```

### 方式二：pnpm 全局安装

```bash
pnpm i -g grsai-cli
```

### 方式三：从源码构建（开发者 / 贡献者）

```bash
git clone https://github.com/668mt/grsai-cli.git
cd grsai-cli
pnpm install
pnpm build           # 自动 npm link --force
grsai --version
```

### 方式四：本地直接跑（不安装）

```bash
git clone https://github.com/668mt/grsai-cli.git
cd grsai-cli && pnpm install && pnpm build
node dist/cli.js --version
```

> **环境要求**：Node.js ≥ 18，pnpm ≥ 8（推荐）。

---

## ⚙️ Configuration

```bash
# 1. API Key（写入 ~/.grsai/config.json）
grsai config set --api-key sk-xxx

# 2. 默认输出目录（可选；未设置则输出到当前工作目录）
grsai config set --output-dir ./generated

# 3. 代理（科研网 / 内网场景）
grsai config set --proxy http://127.0.0.1:7890

# 4. 查看当前配置（API Key 自动脱敏）
grsai config get

# 5. 查看 / 列出所有配置
grsai config list
grsai config path
```

**API Key 解析优先级**（从高到低）：

1. CLI 参数 `-k, --api-key`
2. 配置文件 `~/.grsai/config.json` 的 `apiKey` 字段
3. 环境变量 `GRSAI_API_KEY`
4. 环境变量 `AI_PAINT_API_KEY`（旧名兼容）

---

## 🎨 Usage

### `banana` — grsai nano-banana 图像

```bash
# 单张 16:9 / 2K
grsai banana -p "赛博朋克夜景" --ratio 16:9 --size 2K -o out.png

# 并发生成 3 张
grsai banana -p "招财猫，写实风格" --count 3 --overwrite -o ./cats/

# 多参考图（URL 或本地路径均可，本地路径自动转 base64）
grsai banana -p "融合这两张图的风格" \
  -i https://example.com/a.png \
  -i ./b.png \
  -o merge.png
```

### `gpt` — grsai gpt-image-2 / 2.5

```bash
grsai gpt -p "极简 logo" --model gpt-image-2.5 --ratio 1:1 --count 4 -o ./logos/
```

### `minimax-h3` — grsai minimax-h3 视频

```bash
grsai minimax-h3 \
  -p "电影级写实风格；10s 视频；镜头从城市俯瞰缓慢推进" \
  --ratio portrait --resolution 1080p --duration 10 \
  -o ./videos/clip.mp4
```

### `install` — 把内置 skill 装到 agent 系统

```bash
# 装所有内置 skill 到 ~/.agents/skills/
grsai install

# 只装指定 skill
grsai install grsai

# 列出可用 skill（不安装）
grsai install --list

# 不覆盖已存在的 skill
grsai install --no-force

# 自定义目标目录
grsai install --target ~/my-agent-skills
```

> 默认会覆盖，`--no-force` 跳过已存在的 skill。

### `web` — 启动本地 Web 调试台

```bash
grsai web              # 默认端口 5173，前端 + 后端一起启动
grsai web --port 8080  # 自定义前端端口
grsai web --no-open    # 不自动打开浏览器
```

前端：React + Vite（HMR）｜后端：Hono（tsx watch，改后端代码自动重启）｜前端 5173 / 后端 5174。

### `config` — 管理持久化配置

| 子命令 | 功能 |
|--------|------|
| `grsai config get` | 查看当前生效配置 |
| `grsai config set <key=value>` | 设置配置项 |
| `grsai config list` | 列出所有配置项 |
| `grsai config path` | 输出配置文件路径 |

---

## 📖 Command Reference

### 全局选项

所有 generate 子命令（`banana` / `gpt` / `minimax-h3`）共享以下选项：

| 选项 | 含义 | 默认 |
|------|------|------|
| `-p, --prompt <text>` | 提示词 | **必填** |
| `-o, --output <path>` | 输出路径（单张=文件，多张=目录） | 当前目录 |
| `-n, --count <N>` | 生成数量（1~5，并发跑） | `1` |
| `-i, --image <url\|path>` | 参考图（可重复；本地路径自动转 base64） | - |
| `--overwrite` | 覆盖已存在的输出文件 | `false` |
| `-k, --api-key <key>` | 临时 API Key（覆盖配置） | - |
| `--proxy <url>` | HTTP/S 代理 | - |
| `--poll-intervals "5,5,10"` | 自定义动态轮询间隔（秒，逗号分隔） | `5,5,10` |
| `--max-wait <seconds>` | 最长等待时间（秒） | `600` |

### 各模型特有选项

**`banana`:**

| 选项 | 取值 |
|------|------|
| `--ratio` | `1:1` / `3:4` / `4:3` / `9:16` / `16:9` / ... |
| `--size` | `1K` / `2K` / `4K` |

**`gpt`:**

| 选项 | 取值 |
|------|------|
| `--model` | `gpt-image-2` / `gpt-image-2.5` |
| `--ratio` | `1:1` / `3:2` / `2:3` ... |

**`minimax-h3`（视频）:**

| 选项 | 取值 |
|------|------|
| `--ratio` | `portrait` / `landscape` |
| `--resolution` | `720p` / `1080p` |
| `--duration` | 视频时长（秒） |

---

## 🧑‍💻 Development

```bash
# 安装依赖
pnpm install

# 一条命令启动完整 dev 环境（后端 tsx watch + 前端 Vite HMR）
pnpm dev
# → 浏览器打开 http://localhost:5173
# → 后端 5174（前端代理 /api 过去）

# 单条命令调试（不带前端）
pnpm dev:once banana -p "测试 prompt"

# 仅启动前端 Vite dev server
pnpm web:dev

# 构建产物到 dist/
pnpm build            # postbuild 自动 npm link --force

# 质量门禁
pnpm typecheck        # tsc --noEmit
pnpm lint             # eslint
pnpm test             # vitest run
pnpm test:watch       # vitest --watch
```

> ⚠️ pnpm 11 默认拒绝依赖运行 install scripts。如果遇到 `ERR_PNPM_IGNORED_BUILDS`，
> 可绕过：`npx tsx src/cli.ts banana -p "..."`。

### 📁 Project Structure

```
grsai-cli/
├── src/
│   ├── cli.ts                  # CLI 入口（commander）
│   ├── index.ts                # 库主入口（供其他包 import）
│   ├── dev-server.ts           # dev 后端（tsx watch）
│   ├── commands/               # 子命令实现
│   │   ├── banana.ts           # banana 子命令
│   │   ├── gpt.ts              # gpt 子命令
│   │   ├── minimax-h3.ts       # minimax-h3 子命令（视频）
│   │   ├── install.ts          # 安装内置 skill 到 ~/.agents/skills/
│   │   ├── web.ts              # 启动 Web 调试台
│   │   └── config.ts           # config 子命令
│   ├── api/                    # 模型客户端
│   │   ├── base.ts             # BaseImageClient 抽象基类
│   │   ├── grsai-runner.ts     # Grsai 通用任务运行器（submit + 动态轮询）
│   │   ├── banana.ts           # BananaClient（nano-banana）
│   │   ├── gpt.ts              # GptImageClient（gpt-image-2 / 2.5）
│   │   └── minimaxH3.ts        # MinimaxH3Client（minimax-h3 视频）
│   ├── server/                 # Web 后端（Hono）
│   ├── utils/                  # 工具
│   │   ├── logger.ts           # picocolors 封装
│   │   ├── http.ts             # ofetch 封装 + 代理
│   │   ├── download.ts         # URL / data URL 下载 + 原子写
│   │   ├── retry.ts            # 指数退避重试
│   │   └── config.ts           # ~/.grsai/config.json 持久化
│   └── types/                  # 全局类型
├── web/                        # Web 前端（Vite + React，独立 package.json）
├── tests/                      # Vitest 测试
├── docs/                       # 额外文档
├── package.json
├── pnpm-workspace.yaml         # pnpm 11+ allowBuilds 等配置
├── tsconfig.json
├── tsup.config.ts              # 构建配置（tsup）
├── vitest.config.ts
├── eslint.config.js
└── .prettierrc.json
```

### 🔌 Adding a New Model

1. 在 `src/api/` 实现新客户端，继承 `BaseImageClient`
   ```ts
   export class MyModelClient extends BaseImageClient {
     protected get apiPath() { return '/path/to/your/api'; }
     protected buildPayload(req: GenerateRequest) { /* ... */ }
     // ...
   }
   ```
2. 在 `src/commands/` 写对应命令文件（参考 `banana.ts`）
3. 在 `src/cli.ts` 注册子命令
4. 在 `README.md`「🎨 Usage」章节加使用示例

> 通用 submit + 动态轮询 + 失败原因提取已抽到 `GrsaiTaskRunner`（`src/api/grsai-runner.ts`），新模型只要实现 `submit()` / `extractTaskId()` 即可复用轮询逻辑。

---

## ❓ FAQ

<details>
<summary><b>npm link 报 <code>EEXIST: file already exists</code>？</b></summary>

全局 `grsai` 已存在时，`pnpm build` 末尾的 `npm link` 会失败。已在 `package.json` 的 `postbuild` 用 `npm link --force` 自动覆盖。如果手动 link 也请加 `--force`：

```bash
npm link --force
```
</details>

<details>
<summary><b>pnpm 11 报 <code>ERR_PNPM_IGNORED_BUILDS</code>？</b></summary>

pnpm 11 默认拒绝依赖运行 install scripts（`esbuild` / `unrs-resolver` 需要）。

绕过方式（任选其一）：

```bash
# 1) 用 npx tsx 跑源码（不依赖 install scripts）
npx tsx src/cli.ts banana -p "..."

# 2) 在 pnpm-workspace.yaml 显式 allow（项目已配置）
#    详见 pnpm-workspace.yaml
```
</details>

<details>
<summary><b>目标文件已存在怎么办？</b></summary>

加 `--overwrite` 显式覆盖：

```bash
grsai banana -p "..." -o out.png --overwrite
```

并发多张时会先统一校验全部目标文件，任一已存在即整体报错。
</details>

<details>
<summary><b>怎么走代理？</b></summary>

三种方式（优先级从高到低）：

```bash
# 1. CLI 参数
grsai banana -p "..." --proxy http://127.0.0.1:7890

# 2. 配置文件
grsai config set --proxy http://127.0.0.1:7890

# 3. 环境变量（ofetch 默认行为）
HTTPS_PROXY=http://127.0.0.1:7890 grsai banana -p "..."
```
</details>

<details>
<summary><b>配置文件存在哪里？</b></summary>

```bash
grsai config path
# → Windows: C:\Users\<you>\.grsai\config.json
# → macOS / Linux: ~/.grsai/config.json
```
</details>

<details>
<summary><b>时间单位是秒还是毫秒？</b></summary>

- `--poll-intervals`、`--max-wait`、`pollIntervalsSeconds`、`maxWaitSeconds` → **秒**
- `timeoutMs`（单次 HTTP 超时）和 `RetryUtils` 内部退避 → **毫秒**
</details>

---

## 🤝 Related Projects

- [ai-stdio](https://github.com/668mt/ai-stdio) — Java 版 grsai CLI（本项目的"祖先"）
- [ai-stdio-py](https://github.com/668mt/ai-stdio-py) — Python 视频生成

---

## 📜 License

[MIT](./LICENSE) © [Martin](https://github.com/668mt)