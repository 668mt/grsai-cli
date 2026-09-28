# AGENTS.md - grsai CLI

## 项目概述

`grsai` 是 grsai 平台的 TypeScript CLI 工具，用于图像/视频生成。
- 包名：`grsai`
- 命令名：`grsai`
- 入口：`src/cli.ts`，构建产物：`dist/cli.js`

## 子命令一览

| 子命令 | 功能 |
|--------|------|
| `banana` | grsai nano-banana 系列生成图片（自动轮询 + 自动重试 + 并发） |
| `gpt` | grsai gpt-image-2 / 2.5 系列生成图片（同上） |
| `minimax-h3` | grsai minimax-h3 生成视频（同上） |
| `web` | 启动本地 Web 服务（React + Vite 前端） |
| `config get / set / list / path` | 管理持久化配置 |



## 项目概述

`ai-paint` 是 ai-studio 体系下的 **TypeScript CLI 工具**，对 grsai 系列模型（nano-banana / gpt-image-2 / gpt-image-2.5 / minimax-h3）提供命令行调用。
- 包名：`ai-paint`
- 命令名：`ai-paint`
- 入口：`src/cli.ts`，构建产物：`dist/cli.js`

## 子命令一览

| 子命令 | 功能 |
|--------|------|
| `banana` | grsai nano-banana 系列生成图片（自动轮询 + 自动重试 + 并发） |
| `gpt` | grsai gpt-image-2 / 2.5 系列生成图片（同上） |
| `minimax-h3` | grsai minimax-h3 生成视频（同上；命令名沿用 paint 但实际是视频） |
| `config get / set / list / path` | 管理持久化配置 |

## 环境要求

- **Node.js**: >= 18.0.0
- **包管理**: pnpm >= 8.0.0（推荐）
- **TypeScript**: 5.x

## 常用命令

```bash
# 一条命令启动完整 web 调试环境（后端 API + 前端 Vite HMR）
pnpm dev
# 浏览器访问 http://localhost:5173
# 后端在 5174（前端代理 /api 过去），改后端代码自动重启

# CLI 单条命令调试
pnpm dev:once banana -p "测试 prompt"

# 跑后端 tsx watch（不带前端）
pnpm dev web --port 5174 --no-open   # 单次
# 或
pnpm dev:once web --port 5174 --no-open

# 单独跑前端 Vite dev server
pnpm web:dev

# 构建产物（输出到 dist/）
pnpm build

# 启动生产模式 web（前端 dist 已构建好）
pnpm build && pnpm web:build
pnpm web:prod   # = node dist/cli.js web

# 类型检查
pnpm typecheck

# Lint & Format
pnpm lint
pnpm format

# 测试
pnpm test
pnpm test:watch
```

> ⚠️ pnpm 11 会在执行脚本前做 `verify-deps-before-run` 检查，对未批准 build scripts 的依赖会报错（`esbuild` / `unrs-resolver`）。如果遇到 `ERR_PNPM_IGNORED_BUILDS`，用 `npx tsx ...` 绕过。

## 目录结构

```
ai-paint/
├── src/
│   ├── cli.ts               # commander 入口
│   ├── index.ts             # 库导出
│   ├── commands/
│   │   ├── banana.ts        # banana 子命令
│   │   ├── gpt.ts           # gpt 子命令
│   │   ├── minimax-h3.ts    # minimax-h3 子命令（视频）
│   │   └── config.ts        # config 子命令（get / set / path）
│   ├── api/
│   │   ├── base.ts          # BaseImageClient 抽象基类
│   │   ├── grsai-runner.ts  # Grsai 通用任务运行器（submit + 动态轮询 + failure_reason）
│   │   ├── banana.ts        # BananaClient（Grsai nano-banana）
│   │   ├── gpt.ts           # GptImageClient（Grsai gpt-image-2 / 2.5）
│   │   └── minimaxH3.ts     # MinimaxH3Client（Grsai minimax-h3 视频）
│   ├── utils/
│   │   ├── logger.ts        # picocolors 封装
│   │   ├── http.ts          # ofetch 封装 + 代理
│   │   ├── download.ts      # URL / data URL 下载 + 原子写 + formatOutput
│   │   ├── retry.ts         # RetryUtils（execute + 指数退避）
│   │   └── config.ts        # ~/.ai-paint/config.json 持久化
│   └── types/
│       └── index.ts         # 全局类型
├── tests/                   # vitest
├── docs/                    # 额外文档
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── eslint.config.js
└── .prettierrc.json
```

## 命名规范

| 元素 | 规范 | 示例 |
|------|------|------|
| 类名 | PascalCase | `GeminiClient`、`BaseImageClient` |
| 接口名 | PascalCase | `GenerateRequest`、`ImageClient` |
| 函数名 | camelCase | `runGenerate`、`downloadImage` |
| 变量 | camelCase | `apiKey`、`outputDir` |
| 常量 | UPPER_SNAKE_CASE | `DEFAULT_CONFIG` |
| 文件名 | camelCase / kebab-case | `gemini.ts`、`http-client.ts` |

## Import 组织顺序（无空行分组）

1. Node 内置（`node:*`）
2. 第三方依赖
3. 项目内部（相对路径 + `.js` 扩展名强制 ESM 友好）

示例：

```ts
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import ora from 'ora';

import type { GenerateRequest } from '../types/index.js';
import { buildClient } from '../api/index.js';
import { logger } from '../utils/logger.js';
```

> 项目使用 ESM + `moduleResolution: bundler`，相对导入**必须**加 `.js` 后缀以匹配编译后输出。

## 类结构顺序

1. `import` 声明
2. Javadoc 类注释（含 `@Author`、`@Date`）
3. 静态常量
4. 实例字段
5. 构造方法
6. 静态方法
7. 公开方法（public）
8. 受保护/私有方法（protected / private）
9. getter / setter

## 代码注释

- 公开 API 使用 Javadoc（`/** ... */`）
- 类级别注释格式：

```ts
/**
 * @Author Martin
 * @Date 2026/9/22
 *
 * 简短说明
 */
```

## 错误处理

- 不可恢复错误抛出 `Error` 或自定义子类
- 参数无效抛出 `Error` + 明确 message（无需引入额外的异常类）
- IO 操作抛出底层错误（不要吞）
- 异步链路使用 try/catch + 命令顶层打印（见 `src/cli.ts` 的 `process.exitCode` 模式）

## 日志规范

- 使用 `utils/logger.ts` 中的 `logger.info/warn/error/success` 等
- **`console.log` 仅在用户必须直接看到的纯文本场景使用**（如 `config get` 输出 JSON）

## 依赖说明

| 依赖 | 用途 |
|------|------|
| `commander` | CLI 参数解析 |
| `ofetch` | HTTP 客户端 |
| `ora` | 加载动画 |
| `picocolors` | 终端颜色（轻量） |

## 🚨 测试纪律（高优先级，每次开发前必读）

### 🚫 禁止在调试时反复触发真生成命令

`grsai banana` / `grsai gpt` / `grsai minimax-h3` **会调用真实 grsai 平台 API，每次执行都消耗 API 配额（花用户的钱）**。

| ✅ 可以做（不烧钱） | ❌ 禁止做（每次都烧钱）|
|-------------------|----------------------|
| `grsai --version` / `<cmd> --help` | `grsai banana -p "..."` 真生图 |
| `grsai config get / path` | `grsai gpt -p "..."` 真生图 |
| `grsai install --list / --dry-run` | `grsai minimax-h3 -p "..."` 真生视频 |
| 读 / 写代码、改文档 | 用真 API Key 跑真生成命令测端到端 |
| `pnpm typecheck` / `tsc --noEmit` | 在 CI / dev 脚本里默认跑生成命令 |
| `pnpm build` / `pnpm lint` / `pnpm test` | |
| Python `py_compile` / `importlib` 加载测试 | |
| 用 mock 工具（见下） | |

### 🛠️ 烧钱命令的替代调试手段

**ComfyUI 节点**有专门的 mock CLI 工具，**不调真实 API**：

```
comfyui-nodes/dev-tools/mock-grsai.cmd
```

替换真 `D:\npm\grsai.cmd` 即可让节点调用 mock（详见 `comfyui-nodes/dev-tools/README.md`）。

| 场景 | 推荐做法 |
|------|---------|
| 验证 CLI 端 `--json` 输出协议 | mock + 读 stdout JSON |
| 验证节点 JSON 解析逻辑 | mock + 用 `node.dist/cli's JSON` |
| 验证节点 import / INPUT_TYPES | `importlib.util.spec_from_file_location` + `py_compile` |
| 验证 `tsc` 类型 | `pnpm typecheck` |
| 验证 build 产物 | `pnpm build` |
| 验证 ComfyUI 节点能跑通流程 | mock |
| 验证 `--json` 模式 UI 进度推送 | mock slow 模式 |

### ✅ 真生成命令的唯一合法场景

1. **发版前的 sanity test**：每个子命令跑一次，确认线上 API 仍兼容
2. **用户明确要求**："帮我跑一次试试" / "演示给我看"
3. **生产工作流**：用户在用 CLI 做正经事

**其他所有情况一律用 mock。**

### 🛑 事故教训

历史上曾因反复调真 `grsai banana` 调试 ComfyUI 节点逻辑，单次会话消耗 ~10 次生图配额。
**血的教训**：mock 优先；真 API 是一等公民，不是测试 fixture。

---

| Java 类 / 行为 | TS 对应实现 |
|----------------|-------------|
| `mt.spring.ai.utils.RetryUtils.execute(callable, 1, 500)` | `src/utils/retry.ts` 的 `execute(fn, { maxRetries: 1, intervalMs: 500 })` |
| `RetryUtils.executeWithExponentialBackoff` | `executeWithExponentialBackoff` |
| `DownloadUtils.formatOutput(output, ext, seq)` | `src/utils/download.ts` 的 `formatOutput` |
| `GrsaiUtils.download(file.exists() 抛错 + tempFile + rename)` | `downloadImage` 的 `overwrite=false` 校验 + `atomicWrite` |
| `GrsaiUtils.parseReferenceToUrls`（本地路径→base64） | `normalizeReferences` + `readLocalImageAsDataUrl` |
| `GrsaiApi.pollDrawResult`（轮询 + failure_reason 错误信息） | `src/api/grsai-runner.ts` 的 `pollUntilDone` |
| `GrsaiApi` 动态轮询 `{5,5,10}` 秒 | `DEFAULT_POLL_INTERVALS_SECONDS = [5,5,10]` |
| `GrsaiBananaCli.generate` `count>5` 抛错 | `runBanana` / `runGpt` / `runMinimaxH3` 入口校验 |
| `Executors.newFixedThreadPool(count)` + Future 并发 | `Promise.all` + `runWithConcurrency` |
| `GrsaiUtils.download` 拿 `taskId` 后立即 poll | `GrsaiTaskRunner.submit` + `pollUntilDone` |

## 重要注意事项

- **禁止硬编码 API Key**：必须从配置 / 环境变量 / CLI 参数读取
- **代理**：通过 `--proxy` 或 `config.proxy` 注入，由 `utils/http.ts` 统一处理
- **新增后端**：
  1. 在 `src/api/` 实现新客户端，继承 `BaseImageClient`
  2. 在 `src/commands/` 写对应命令文件
  3. 在 `src/cli.ts` 注册命令
  4. 文档/README 中提及可用模型
- **API Key 解析**：全局共享一个 `apiKey`；命令运行时通过 `resolveApiKey(config, cliKey)` 解析
- **重试粒度**：整个生成流程（submit + poll + download）作为重试单元，与 Java `RetryUtils.execute(fn, 1, 500)` 对齐；调用方在 `commands/` 层用 `execute()` 包起来
- **目标文件已存在**：默认 `overwrite=false`，已存在抛错；多图并发时也会在入口统一校验
- **轮询退避**：默认 `[5s,5s,10s]`（首次轮询 5s 后等 5s，再下次等 10s，之后固定 10s），与 Java `GrsaiApi.pollDrawResult` 一致；可通过 `--poll-intervals` 自定义（单位：秒）
- **时间单位约定**：所有"等待/超时"字段（`--poll-intervals`、`--max-wait`、`pollIntervalsSeconds`、`maxWaitSeconds`）单位都是**秒**；只有 `timeoutMs`（单次 HTTP 超时）和 `RetryUtils` 内部的重试间隔仍是毫秒
- **默认配置**：
  - `timeoutMs` 默认 **600_000（10 分钟）**
  - `outputDir` **可选**，未设置时 fallback 到 `process.cwd()`（输出到当前路径）