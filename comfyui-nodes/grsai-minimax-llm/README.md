# Grsai Minimax LLM (ComfyUI 节点)

调用 **MiniMax (MiniMax) LLM**，支持图片 + 系统提示词 + 用户提示词 → 文本。

协议：**Anthropic Messages API**（MiniMax 的 Anthropic 兼容层）

API Key / BaseUrl / Model 全部从 `~/.grsai/config.json` 读取（与 `grsai config set --llm-api-key` 共享）。

## 安装

```bash
cp -r comfyui-nodes/grsai-minimax-llm  ComfyUI/custom_nodes/
# 符号链接也行
ln -s $(pwd)/comfyui-nodes/grsai-minimax-llm  ComfyUI/custom_nodes/grsai-minimax-llm
```

依赖：标准库 + `requests`（ComfyUI 自带）

## API Key 配置

`~/.grsai/config.json` 里需要：
```json
{
  "llmApiKey": "sk-xxxxxxxxxxxx",
  "llmBaseUrl": "https://api.minimaxi.com/anthropic",
  "llmModel": "MiniMax-M3"
}
```

或用 CLI 配置：
```bash
grsai config set --llm-api-key sk-xxxxxxxx
grsai config set --llm-base-url https://api.minimaxi.com/anthropic
grsai config set --llm-model MiniMax-M3
```

节点的 `api_key_override` / `base_url` 字段可临时覆盖配置。

## 节点参数

### 必填

| 参数 | 类型 | 说明 |
|------|------|------|
| `prompt` | STRING (multiline) | 用户提示词 |
| `max_tokens` | INT | 最大输出 token（含思考 token）|

### 可选

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `system_prompt` | STRING (multiline) | 空 | 系统提示词（控制模型人设） |
| `image` | IMAGE | 无 | 单张图片（仅 M3 / M3.1-Flash-Preview 支持；M2.x 自动忽略） |
| `model` | COMBO | `MiniMax-M3` | 9 个模型可选（默认从配置 `llmModel` 读）|
| `temperature` | FLOAT | `1.0` | [0, 2]；推荐 1.0 |
| `thinking_mode` | COMBO | `auto` | `auto` / `adaptive` / `disabled` |

## 输出

| 输出 | 类型 | 说明 |
|------|------|------|
| `text` | STRING | 模型回复的文本（过滤掉 thinking 块） |
| `status` | STRING | `"OK 12.3s · 1234→567 tokens · end_turn"` |

> 想看思考过程？目前 `text` 输出**不包含** thinking 块（避免污染）。要拿 thinking 块可以加第二个输出 `thinking_text`。

## 支持的模型（来自 [官方文档](https://platform.minimax.cn/docs/api-reference/text-anthropic-api)）

| 模型 | 上下文 | 多模态（图片/视频）| thinking |
|------|--------|------------------|----------|
| `MiniMax-M3` | 1M | ✅ | 默认关，可开启 |
| `MiniMax-M3.1-Flash-Preview` | 1M | ✅ | **强制开** |
| `MiniMax-M2.7` | 204K | ❌ | 始终开 |
| `MiniMax-M2.5` | 204K | ❌ | 始终开 |
| `MiniMax-M2.1` | 204K | ❌ | 始终开 |
| `MiniMax-M2` | 204K | ❌ | 始终开 |

> ⚠️ 给 M2.x 模型传图片会被 API 忽略（不是错误）。

## 示例工作流

### 简单文本生成

```
PrimitiveString (prompt) ─┐
                           ├─ GrsaiMinimaxLLM ─┬─ ShowText (text)
PrimitiveString (system) ─┘                   └─ ShowText (status)
```

### 看图说话

```
LoadImage ─┐
            ├─ GrsaiMinimaxLLM ── ShowText
PrimitiveString ─┘
```

### LLM 改写 prompt → 喂给 banana

```
PrimitiveString ─┐
                  ├─ GrsaiMinimaxLLM ── GrsaiBanana.prompt_text ── PreviewImage
LoadImage ───────┘
```

## ⚠️ 注意事项

- **API Key 安全**：节点**没有** base_url / api_key_override 字段，强制从 `~/.grsai/config.json` 读取。这样分享工作流 JSON 时**不会泄露** API Key
- **图片 token 消耗较大**：单张 1K 图片 ~1k-3k tokens，2K 图片可达 5k+
- **thinking 不输出**：节点的 `text` 输出**不包含** thinking 块（除非以后加第二个输出）
- **超时 300s**：节点默认 5 分钟超时，长 prompt + 长 max_tokens 可能需要更久

## 参考

- [MiniMax Anthropic API 文档](https://platform.minimax.cn/docs/api-reference/text-anthropic-api)
- [Anthropic Messages API 规范](https://docs.anthropic.com/en/api/messages)