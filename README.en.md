<div align="center">

# grsai-cli

**One-line CLI for grsai image & video generation**

Compress the «prompt → image/video → save locally» workflow of models like **nano-banana**, **gpt-image-2 / 2.5**, and **minimax-h3** into a single command.

[![npm version](https://img.shields.io/npm/v/grsai-cli?style=flat-square)](https://www.npmjs.com/package/grsai-cli)
[![npm downloads](https://img.shields.io/npm/dm/grsai-cli?style=flat-square)](https://www.npmjs.com/package/grsai-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](./LICENSE)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)

[中文](./README.md) · [Quick Start](#-quick-start) · [Installation](#-installation) · [Usage](#-usage) · [Development](#-development)

</div>

---

## ✨ Features

- 🚀 **One command**: from prompt to local PNG/MP4 — submit + poll + download, all automated
- 🎨 **Multiple models out of the box**: `nano-banana` (image), `gpt-image-2` & `2.5` (image), `minimax-h3` (video)
- ⚡ **Concurrent generation**: `--count N` runs N jobs in parallel (max 5)
- 🔁 **Auto-retry**: the entire generate flow (submit + poll + download) retries as an atomic unit, with configurable backoff
- 🎯 **Dynamic polling**: `5s → 5s → 10s` stepped backoff, matched to grsai task lifecycle
- 🛡️ **Safe overwrite**: refuses to overwrite existing files by default (aligned with the Java version); use `--overwrite` to opt in
- 🌐 **Proxy-friendly**: built-in HTTP/S proxy support for research networks / intranet gateways
- 🔌 **Extensible**: add a new model by implementing one `BaseImageClient` subclass
- 🧰 **Web playground**: `pnpm dev` boots a React + Vite frontend with a Hono backend and tsx watch in one shot
- 🤖 **Agent Skill**: `grsai install` ships skill definitions to `~/.agents/skills/` for seamless Claude Code integration

---

## 🚀 Quick Start

Zero-install, one-line experience — no clone, no build:

```bash
npx -y grsai-cli@latest install
```

Then configure your API key:

```bash
grsai config set --api-key sk-xxx
```

Try your first generation:

```bash
grsai banana -p "an orange cat napping in the sun, watercolor style" -o cat.png
```

> 💡 The `install` subcommand ships the bundled skill(s) to `~/.agents/skills/`, so your agent can pick up this tool automatically.
> Want `grsai` as a global command instead of `npx`? See [📦 Installation](#-installation).

---

## 📦 Installation

### Option 1: Install globally via npm (recommended)

```bash
npm i -g grsai-cli
grsai --version   # should print 0.1.0 or newer
```

### Option 2: Install globally via pnpm

```bash
pnpm i -g grsai-cli
```

### Option 3: Build from source (for contributors)

```bash
git clone https://github.com/668mt/grsai-cli.git
cd grsai-cli
pnpm install
pnpm build           # auto runs npm link --force
grsai --version
```

### Option 4: Run locally without installing

```bash
git clone https://github.com/668mt/grsai-cli.git
cd grsai-cli && pnpm install && pnpm build
node dist/cli.js --version
```

> **Requirements**: Node.js ≥ 18, pnpm ≥ 8 (recommended).

---

## ⚙️ Configuration

```bash
# 1. API key (persisted to ~/.grsai/config.json)
grsai config set --api-key sk-xxx

# 2. Default output directory (optional; falls back to cwd)
grsai config set --output-dir ./generated

# 3. Proxy (research network / intranet scenarios)
grsai config set --proxy http://127.0.0.1:7890

# 4. Show effective config (API key is masked)
grsai config get

# 5. List all settings / show config file path
grsai config list
grsai config path
```

**API Key resolution order** (highest priority first):

1. CLI flag `-k, --api-key`
2. `apiKey` field in `~/.grsai/config.json`
3. Environment variable `GRSAI_API_KEY`
4. Environment variable `AI_PAINT_API_KEY` (legacy compatibility)

---

## 🎨 Usage

### `banana` — grsai nano-banana image generation

```bash
# Single image, 16:9 / 2K
grsai banana -p "cyberpunk cityscape at night" --ratio 16:9 --size 2K -o out.png

# Three images in parallel
grsai banana -p "lucky cat, photorealistic" --count 3 --overwrite -o ./cats/

# Multiple reference images (URL or local path; local paths auto-convert to base64)
grsai banana -p "blend the style of these two images" \
  -i https://example.com/a.png \
  -i ./b.png \
  -o merge.png
```

### `gpt` — grsai gpt-image-2 / 2.5

```bash
grsai gpt -p "minimal logo" --model gpt-image-2.5 --ratio 1:1 --count 4 -o ./logos/
```

### `minimax-h3` — grsai minimax-h3 video generation

```bash
grsai minimax-h3 \
  -p "cinematic realism; 10s video; slow aerial push-in over a city" \
  --ratio portrait --resolution 1080p --duration 10 \
  -o ./videos/clip.mp4
```

### `install` — Ship bundled skill(s) into your agent system

```bash
# Install all bundled skills into ~/.agents/skills/
grsai install

# Install a specific skill
grsai install grsai

# List available skills (no install)
grsai install --list

# Skip skills that already exist
grsai install --no-force

# Custom target directory
grsai install --target ~/my-agent-skills
```

> Existing skills are overwritten by default. Pass `--no-force` to skip them.

### `web` — Launch the local Web playground

```bash
grsai web              # default port 5173, starts frontend + backend
grsai web --port 8080  # custom frontend port
grsai web --no-open    # don't auto-open the browser
```

Frontend: React + Vite (HMR) · Backend: Hono (tsx watch, restarts on backend changes) · Ports: frontend `5173` / backend `5174`.

### `config` — Manage persisted configuration

| Subcommand | Purpose |
|------------|---------|
| `grsai config get` | Show effective config |
| `grsai config set <key=value>` | Set a config value |
| `grsai config list` | List all config keys |
| `grsai config path` | Print config file path |

---

## 📖 Command Reference

### Shared options (all generate subcommands)

All `banana` / `gpt` / `minimax-h3` subcommands accept:

| Option | Description | Default |
|--------|-------------|---------|
| `-p, --prompt <text>` | Prompt | **required** |
| `-o, --output <path>` | Output path (file for single, dir for multiple) | `cwd` |
| `-n, --count <N>` | Number of images to generate (1–5, parallel) | `1` |
| `-i, --image <url\|path>` | Reference image (repeatable; local paths auto-base64) | — |
| `--overwrite` | Overwrite existing output files | `false` |
| `-k, --api-key <key>` | One-off API key (overrides config) | — |
| `--proxy <url>` | HTTP/S proxy URL | — |
| `--poll-intervals "5,5,10"` | Custom polling intervals in seconds (comma-separated) | `5,5,10` |
| `--max-wait <seconds>` | Maximum wait time in seconds | `600` |

### Model-specific options

**`banana`:**

| Option | Values |
|--------|--------|
| `--ratio` | `1:1` / `3:4` / `4:3` / `9:16` / `16:9` / ... |
| `--size` | `1K` / `2K` / `4K` |

**`gpt`:**

| Option | Values |
|--------|--------|
| `--model` | `gpt-image-2` / `gpt-image-2.5` |
| `--ratio` | `1:1` / `3:2` / `2:3` ... |

**`minimax-h3` (video):**

| Option | Values |
|--------|--------|
| `--ratio` | `portrait` / `landscape` |
| `--resolution` | `720p` / `1080p` |
| `--duration` | Video length in seconds |

---

## 🧑‍💻 Development

```bash
# Install dependencies
pnpm install

# Full dev environment: backend (tsx watch) + frontend (Vite HMR)
pnpm dev
# → open http://localhost:5173
# → backend on 5174 (frontend proxies /api to it)

# Single command debug (no frontend)
pnpm dev:once banana -p "test prompt"

# Frontend only
pnpm web:dev

# Build to dist/
pnpm build            # postbuild auto-runs npm link --force

# Quality gates
pnpm typecheck        # tsc --noEmit
pnpm lint             # eslint
pnpm test             # vitest run
pnpm test:watch       # vitest --watch
```

> ⚠️ pnpm 11 refuses to run install scripts from dependencies by default. If you hit `ERR_PNPM_IGNORED_BUILDS`, bypass it:
> `npx tsx src/cli.ts banana -p "..."`.

### 📁 Project Structure

```
grsai-cli/
├── src/
│   ├── cli.ts                  # CLI entry (commander)
│   ├── index.ts                # Library entry (for other packages to import)
│   ├── dev-server.ts           # Dev backend (tsx watch)
│   ├── commands/               # Subcommand implementations
│   │   ├── banana.ts           # banana subcommand
│   │   ├── gpt.ts              # gpt subcommand
│   │   ├── minimax-h3.ts       # minimax-h3 subcommand (video)
│   │   ├── install.ts          # Install bundled skill(s) to ~/.agents/skills/
│   │   ├── web.ts              # Launch Web playground
│   │   └── config.ts           # config subcommand
│   ├── api/                    # Model clients
│   │   ├── base.ts             # BaseImageClient abstract base class
│   │   ├── grsai-runner.ts     # Grsai generic task runner (submit + dynamic poll)
│   │   ├── banana.ts           # BananaClient (nano-banana)
│   │   ├── gpt.ts              # GptImageClient (gpt-image-2 / 2.5)
│   │   └── minimaxH3.ts        # MinimaxH3Client (minimax-h3 video)
│   ├── server/                 # Web backend (Hono)
│   ├── utils/                  # Utilities
│   │   ├── logger.ts           # picocolors wrapper
│   │   ├── http.ts             # ofetch wrapper + proxy
│   │   ├── download.ts         # URL / data URL download + atomic write
│   │   ├── retry.ts            # Exponential-backoff retry
│   │   └── config.ts           # ~/.grsai/config.json persistence
│   └── types/                  # Shared types
├── web/                        # Web frontend (Vite + React, own package.json)
├── tests/                      # Vitest tests
├── docs/                       # Additional docs
├── package.json
├── pnpm-workspace.yaml         # pnpm 11+ allowBuilds etc.
├── tsconfig.json
├── tsup.config.ts              # Build config (tsup)
├── vitest.config.ts
├── eslint.config.js
└── .prettierrc.json
```

### 🔌 Adding a New Model

1. Implement a new client under `src/api/`, extending `BaseImageClient`:
   ```ts
   export class MyModelClient extends BaseImageClient {
     protected get apiPath() { return '/path/to/your/api'; }
     protected buildPayload(req: GenerateRequest) { /* ... */ }
     // ...
   }
   ```
2. Add the corresponding command file under `src/commands/` (see `banana.ts` as a template).
3. Register the subcommand in `src/cli.ts`.
4. Add a usage example under `🎨 Usage` in this README.

> The common submit + dynamic-poll + `failure_reason` extraction is abstracted into `GrsaiTaskRunner` (`src/api/grsai-runner.ts`); a new model only needs to implement `submit()` / `extractTaskId()` to reuse the polling logic.

---

## ❓ FAQ

<details>
<summary><b><code>npm link</code> fails with <code>EEXIST: file already exists</code>?</b></summary>

A global `grsai` already exists, so the `npm link` at the end of `pnpm build` fails. `package.json`'s `postbuild` already uses `npm link --force` to auto-overwrite. If you link manually, pass `--force`:

```bash
npm link --force
```
</details>

<details>
<summary><b>pnpm 11 fails with <code>ERR_PNPM_IGNORED_BUILDS</code>?</b></summary>

pnpm 11 refuses to run install scripts from dependencies by default (`esbuild` and `unrs-resolver` need them).

Workarounds (pick one):

```bash
# 1) Run the source directly with npx tsx (bypasses install scripts)
npx tsx src/cli.ts banana -p "..."

# 2) Allow explicitly in pnpm-workspace.yaml (already configured in this repo)
#    See pnpm-workspace.yaml
```
</details>

<details>
<summary><b>Output file already exists?</b></summary>

Pass `--overwrite` to overwrite:

```bash
grsai banana -p "..." -o out.png --overwrite
```

For multiple images, the runner pre-checks all targets up front; if any one exists, the whole batch is rejected unless `--overwrite` is set.
</details>

<details>
<summary><b>How do I use a proxy?</b></summary>

Three ways (highest priority first):

```bash
# 1. CLI flag
grsai banana -p "..." --proxy http://127.0.0.1:7890

# 2. Config file
grsai config set --proxy http://127.0.0.1:7890

# 3. Environment variable (ofetch default behavior)
HTTPS_PROXY=http://127.0.0.1:7890 grsai banana -p "..."
```
</details>

<details>
<summary><b>Where is the config file?</b></summary>

```bash
grsai config path
# → Windows: C:\Users\<you>\.grsai\config.json
# → macOS / Linux: ~/.grsai/config.json
```
</details>

<details>
<summary><b>Are time units seconds or milliseconds?</b></summary>

- `--poll-intervals`, `--max-wait`, `pollIntervalsSeconds`, `maxWaitSeconds` → **seconds**
- `timeoutMs` (single HTTP request timeout) and internal `RetryUtils` backoff → **milliseconds**
</details>

---

## 🤝 Related Projects

- [ai-stdio](https://github.com/668mt/ai-stdio) — Java grsai CLI (the ancestor of this project)
- [ai-stdio-py](https://github.com/668mt/ai-stdio-py) — Python video generation

---

## 📜 License

[MIT](./LICENSE) © [Martin](https://github.com/668mt)