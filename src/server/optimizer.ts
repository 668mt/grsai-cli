/**
 * @Author Martin
 * @Date 2026/9/22
 *
 * 提示词优化 agent
 *
 * 支持两种协议（按 baseUrl 自动选择）：
 *   - Anthropic 协议：baseUrl 含 /anthropic 或包含 anthropic
 *   - OpenAI 兼容协议：其他 baseUrl
 *
 * Anthropic 协议用原生 fetch（避免 langchain ChatAnthropic 默认带 top_p=0 等参数，
 * 某些兼容服务（如 minimax）拒绝这些参数）。
 *
 * 配置（grsai config set）：
 *   --llm-api-key <KEY>      必须
 *   --llm-base-url <url>     可选，默认 https://api.openai.com/v1
 *   --llm-model <model>      可选，默认 gpt-4o-mini（OpenAI）或 claude-3-5-sonnet-latest（Anthropic）
 */

import { ChatOpenAI } from '@langchain/openai';
import { logger } from '../utils/logger.js';
import type { BackendId } from '../types/index.js';

const SYSTEM_PROMPT = `你是一位专业的 AI 绘图提示词工程师。
你的任务是把用户简短的口语化描述改写成 3 个不同角度的高质量中文绘图提示词，供用户挑选。

要求：
1. 必须输出 3 个版本（不同风格/侧重点，不要雷同）
2. 输出必须是中文（简体中文）
3. 每个版本都要加入具体的视觉细节：主体、构图、镜头、光线、色调、风格
4. 保持原意，不偏离用户核心诉求
5. 每个版本长度 50-150 字最佳（中文比英文信息密度低，可适当多写）
6. 视频类（minimax-h3）提示词要包含：时长结构、镜头运动、场景描述、声音设计、负面提示词
7. 严格遵守安全规范：不要涉及真人面部、暴力、裸露、政治敏感内容

输出格式（严格 JSON，不要任何其他内容）：
{"variants": ["版本1的提示词", "版本2的提示词", "版本3的提示词"]}`;

const VIDEO_HINT: Record<string, string> = {
  'minimax-h3': '这是视频生成，请包含：时长（如 "10秒"）、镜头推进/拉远、关键帧描述、声音设计（对白/音效/背景音乐）、视觉风格、负面提示词',
};

export interface OptimizeOptions {
  prompt: string;
  backend: BackendId;
  /** 用户当前选的模型（如 nano-banana-2 / gpt-image-2.5 / minimax-h3） */
  model?: string;
  /** 比例 / 像素值（如 1:1 / 1024x1024 / portrait） */
  ratio?: string;
  /** 图片分辨率（1K / 2K / 4K） */
  size?: string;
  /** 质量档（auto / low / medium / high） */
  quality?: string;
  /** 视频时长（秒） */
  duration?: number;
  /** 视频分辨率（480p / 768p / 1080p） */
  resolution?: string;
  llmApiKey?: string;
  llmBaseUrl?: string;
  llmModel?: string;
}

/** 把后端参数格式化成可读的描述块 */
function describeParams(opts: OptimizeOptions): string {
  const lines: string[] = [];
  lines.push(`后端: ${opts.backend}`);
  if (opts.model) lines.push(`模型: ${opts.model}`);
  if (opts.ratio) lines.push(`比例: ${opts.ratio}`);
  if (opts.size) lines.push(`尺寸: ${opts.size}`);
  if (opts.quality) lines.push(`质量: ${opts.quality}`);
  if (opts.duration) lines.push(`时长: ${opts.duration}s`);
  if (opts.resolution) lines.push(`分辨率: ${opts.resolution}`);
  return lines.length > 1 ? lines.join(' | ') : lines[0]!;
}

/**
 * 探测 LLM 协议：
 *   - URL 含 "anthropic" → Anthropic 协议
 *   - 其他 → OpenAI 兼容协议
 */
function detectProtocol(baseUrl: string): 'anthropic' | 'openai' {
  return baseUrl.toLowerCase().includes('anthropic') ? 'anthropic' : 'openai';
}

/**
 * 用 LLM 优化提示词，返回 3 个变体
 *
 * 未配置 LLM 时返回 [原文]（单元素数组）
 * 失败时返回 [原文]
 */
export async function optimizePrompt(
  opts: OptimizeOptions,
): Promise<string[]> {
  if (!opts.llmApiKey) {
    return [opts.prompt];
  }

  const baseUrl = opts.llmBaseUrl ?? 'https://api.openai.com/v1';
  const protocol = detectProtocol(baseUrl);

  const hint = VIDEO_HINT[opts.backend] ?? '这是图片生成，重点是画面构图和风格';
  const paramsDesc = describeParams(opts);
  const userMessage = `${hint}\n\n当前生成参数：${paramsDesc}\n\n原始提示词：${opts.prompt}`;

  let text: string;
  try {
    text = protocol === 'anthropic'
      ? await callAnthropic(opts, baseUrl, SYSTEM_PROMPT, userMessage)
      : await callOpenAI(opts, baseUrl, SYSTEM_PROMPT, userMessage);
  } catch (e) {
    logger.warn(`LLM 优化失败，返回原文：${(e as Error).message}`);
    return [opts.prompt];
  }

  // 解析 LLM 返回的 JSON
  const variants = parseVariants(text);
  return variants.length > 0 ? variants : [opts.prompt];
}

/**
 * 从 LLM 输出里抽出 variants 数组
 * 容错处理：可能返回 ```json\n{...}\n``` 或 带额外文字
 */
function parseVariants(text: string): string[] {
  // 优先尝试提取 ```json ... ``` 块
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const jsonText = fence?.[1] ?? text;

  // 找 JSON 对象
  const objMatch = /\{[\s\S]*\}/.exec(jsonText);
  const objText = objMatch?.[0];
  if (objText) {
    try {
      const obj = JSON.parse(objText) as { variants?: unknown };
      if (Array.isArray(obj.variants)) {
        return obj.variants
          .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
          .map(v => v.trim());
      }
    } catch {
      /* fallthrough */
    }
  }

  // 兜底：尝试按行/换行拆分（兼容性老格式）
  return text
    .split(/\n+/)
    .map(l => l.replace(/^\s*\d+[.、)]\s*/, '').trim())
    .filter(l => l.length >= 10 && l.length <= 500);
}

async function callOpenAI(
  opts: OptimizeOptions,
  baseUrl: string,
  system: string,
  user: string,
): Promise<string> {
  const model = new ChatOpenAI({
    apiKey: opts.llmApiKey,
    configuration: { baseURL: baseUrl },
    model: opts.llmModel ?? 'gpt-4o-mini',
    temperature: 0.7,
  });
  const resp = await model.invoke([
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]);
  return typeof resp.content === 'string' ? resp.content : String(resp.content);
}

async function callAnthropic(
  opts: OptimizeOptions,
  baseUrl: string,
  system: string,
  user: string,
): Promise<string> {
  // 直接用 fetch，避免 langchain ChatAnthropic 默认带 top_p=0 / top_k 等参数
  // （某些兼容服务如 MiniMax 会拒绝这些参数）
  const url = `${baseUrl.replace(/\/$/, '')}/v1/messages`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': opts.llmApiKey ?? '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: opts.llmModel ?? 'claude-3-5-sonnet-latest',
      max_tokens: 1024,
      temperature: 0.7,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Anthropic API ${resp.status}: ${text}`);
  }

  const data = (await resp.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const block = data.content?.find(b => b.type === 'text');
  return block?.text ?? '';
}

/** 检测 LLM 是否已配置 */
export function isLlmConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.LLM_API_KEY?.trim());
}