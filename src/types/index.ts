/**
 * @Author Martin
 * @Date 2026/9/22
 *
 * AI Paint 全局类型定义
 */

/** AI 后端标识（一般就是命令名：banana / gpt-image / minimax-h3） */
export type BackendId = string;

/** 通用生成请求 */
export interface GenerateRequest {
  /** 提示词 */
  prompt: string;
  /** 反向提示词（部分后端支持） */
  negativePrompt?: string;
  /** 输入图片 URL / 本地路径（编辑模式使用） */
  inputImages?: string[];
  /** 图片宽高 */
  width?: number;
  height?: number;
  /** 数量 */
  count?: number;
  /** 额外参数透传给后端 */
  extras?: Record<string, unknown>;
}

/** 单张图片结果 */
export interface GeneratedImage {
  /** 图片 URL 或 base64 data URL */
  url: string;
  /** 图片本地路径（若已下载） */
  localPath?: string;
  /** MIME 类型 */
  mimeType?: string;
  /** 修订提示词 */
  revisedPrompt?: string;
}

/** 生成结果 */
export interface GenerateResult {
  /** 生成的所有图片 */
  images: GeneratedImage[];
  /** 使用的后端标识 */
  backend: BackendId;
  /** 总耗时（毫秒） */
  durationMs: number;
}

/** 图片生成客户端接口 */
export interface ImageClient {
  /** 后端标识 */
  readonly id: BackendId;
  /** 后端显示名 */
  readonly displayName: string;
  /** 健康检查（验证 API Key 是否可用） */
  validate(): Promise<void>;
  /** 生成图片 */
  generate(req: GenerateRequest): Promise<GenerateResult>;
}

/** 用户配置 */
export interface AppConfig {
  /** grsai 平台 API Key（所有模型共用一个） */
  apiKey?: string;
  /** 输出目录（不配置则输出到当前路径） */
  outputDir?: string;
  /** HTTP 代理（可选） */
  proxy?: string;
  /** 单次 HTTP 请求超时（毫秒），默认 600_000（10 分钟） */
  timeoutMs: number;
  /** LLM API Key（用于 web agent 优化提示词，OpenAI 兼容格式） */
  llmApiKey?: string;
  /** LLM Base URL，默认 https://api.openai.com/v1 */
  llmBaseUrl?: string;
  /** LLM 模型，默认 gpt-4o-mini */
  llmModel?: string;
}

/** CLI 选项（commander 解析结果） */
export interface GenerateOptions {
  prompt: string;
  output?: string;
  input?: string[];
  width?: string;
  height?: string;
  count?: string;
  profile?: string;
  apiKey?: string;
  proxy?: string;
  negative?: string;
}

/* -------------------------------------------------------------------------- */
/* Grsai 通用（banana / gpt / minimax-h3 都通过 /v1/api/generate + /result） */
/* -------------------------------------------------------------------------- */

/** Grsai 轮询状态 */
export type BananaTaskStatus = 'running' | 'succeeded' | 'violation' | 'failed';

/** Grsai 任务查询结果（banana / gpt / minimax-h3 共用） */
export interface BananaTaskResult {
  id: string;
  status: BananaTaskStatus;
  results?: Array<{ url: string }>;
  /** 0~100 */
  progress?: number;
  error?: string;
  /** 失败原因细分：output_moderation / input_moderation / error */
  failureReason?: string;
  /** 业务级 code：-22 表示任务不存在 */
  code?: number;
  /** 顶层 msg */
  msg?: string;
}

/* -------------------------------------------------------------------------- */
/* Banana (grsai nano-banana)                                                */
/* -------------------------------------------------------------------------- */

export type BananaModel =
  | 'nano-banana'
  | 'nano-banana-fast'
  | 'nano-banana-2'
  | 'nano-banana-2-cl'
  | 'nano-banana-2-2k-cl'
  | 'nano-banana-2-4k-cl'
  | 'nano-banana-pro'
  | 'nano-banana-pro-vt'
  | 'nano-banana-pro-cl'
  | 'nano-banana-pro-vip'
  | 'nano-banana-pro-4k-vip';

export const BANANA_MODELS: BananaModel[] = [
  'nano-banana',
  'nano-banana-fast',
  'nano-banana-2',
  'nano-banana-2-cl',
  'nano-banana-2-2k-cl',
  'nano-banana-2-4k-cl',
  'nano-banana-pro',
  'nano-banana-pro-vt',
  'nano-banana-pro-cl',
  'nano-banana-pro-vip',
  'nano-banana-pro-4k-vip',
];

export type BananaAspectRatio =
  | 'auto' | '1:1' | '16:9' | '9:16' | '4:3' | '3:4'
  | '3:2' | '2:3' | '5:4' | '4:5' | '21:9'
  | '1:4' | '4:1' | '1:8' | '8:1';

export const BANANA_ASPECT_RATIOS: BananaAspectRatio[] = [
  'auto', '1:1', '16:9', '9:16', '4:3', '3:4',
  '3:2', '2:3', '5:4', '4:5', '21:9',
  '1:4', '4:1', '1:8', '8:1',
];

export type BananaImageSize = '1K' | '2K' | '4K';
export const BANANA_IMAGE_SIZES: BananaImageSize[] = ['1K', '2K', '4K'];

/** Banana 生成请求 */
export interface BananaGenerateRequest {
  prompt: string;
  images?: string[];
  model?: BananaModel;
  aspectRatio?: BananaAspectRatio;
  imageSize?: BananaImageSize;
  /** 随机种子（0 = 不指定） */
  seed?: number;
  /** 固定 async 以便轮询 */
  replyType?: 'json' | 'stream' | 'async';
  /** 透传给后端的额外字段 */
  extras?: Record<string, unknown>;
}

/** BananaClient 选项 */
export interface BananaClientOptions {
  apiKey: string;
  /** grsai 基础节点，默认 https://grsai.dakka.com.cn（也可设置 GRSAI_BASE_URL 环境变量） */
  baseUrl?: string;
  proxy?: string;
  timeoutMs?: number;
  /** 轮询间隔（秒），默认 [5, 5, 10] */
  pollIntervalsSeconds?: number[];
  /** 总超时（秒），默认 600（10 分钟） */
  maxWaitSeconds?: number;
  /** 心跳 / 进度日志前缀（含任务编号用于多并发区分），默认 'banana' */
  label?: string;
  /** 心跳回调（每 60s 触发一次），用于更新 spinner 等 UI */
  onTick?: (info: { elapsedSeconds: number; progress: number; status: string }) => void;
}

/** Banana 命令选项 */
export interface BananaCommandOptions {
  prompt: string;
  /** 参考图（URL 或本地路径），可重复 */
  input?: string[];
  /** 输出文件 / 目录 */
  output?: string;
  model?: string;
  ratio?: string;
  size?: string;
  seed?: string;
  /** 生成数量，1~5；超过 5 抛错（对齐 Java） */
  count?: string;
  /** 是否覆盖已存在的输出文件 */
  overwrite?: boolean;
  /** 自定义轮询间隔（毫秒），默认 [10000,15000,20000,25000,30000] */
  pollIntervals?: string;
  /** 最大等待毫秒数 */
  maxWait?: string;
  apiKey?: string;
  proxy?: string;
  /** 重试次数（默认 2） */
  retry?: string;
  /** 是否压缩本地参考图（默认 true；文件 > 5MB 时压缩到 < 2MB） */
  compress?: boolean;
  /** 输出结构化 JSON 到 stdout（机器可读），进度日志走 stderr */
  json?: boolean;
}

/* -------------------------------------------------------------------------- */
/* GPT Image (grsai gpt-image-2 / 2.5)                                       */
/* -------------------------------------------------------------------------- */

export type GptImageModel =
  | 'gpt-image-2'
  | 'gpt-image-2-vip'
  | 'gpt-image-2.5'
  | 'gpt-image-2.5-flare'
  | 'gpt-image-2.5-sunburst';

export const GPT_IMAGE_MODELS: GptImageModel[] = [
  'gpt-image-2',
  'gpt-image-2-vip',
  'gpt-image-2.5',
  'gpt-image-2.5-flare',
  'gpt-image-2.5-sunburst',
];

export type GptImageQuality = 'auto' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export const GPT_IMAGE_QUALITIES: GptImageQuality[] = [
  'auto', 'low', 'medium', 'high', 'xhigh', 'max',
];

export type GptImageBackground = 'transparent';
export const GPT_IMAGE_BACKGROUNDS: GptImageBackground[] = ['transparent'];

/**
 * aspectRatio 字段既可以是比例字符串（"1:1"），
 * 也可以是像素值字符串（"1024x1024"、"2048x2048"）。
 * 用宽松 string 表示。
 */
export type GptImageAspectRatio = string;

export interface GptImageGenerateRequest {
  prompt: string;
  images?: string[];
  model?: GptImageModel;
  /** 比例（如 "1:1"）或像素值（如 "1024x1024"） */
  aspectRatio?: GptImageAspectRatio;
  quality?: GptImageQuality;
  background?: GptImageBackground;
  /** 蒙版 URL */
  mask?: string;
  /** 随机种子（0 = 不指定） */
  seed?: number;
  replyType?: 'json' | 'stream' | 'async';
  extras?: Record<string, unknown>;
}

export interface GptImageClientOptions {
  apiKey: string;
  baseUrl?: string;
  proxy?: string;
  timeoutMs?: number;
  pollIntervalsSeconds?: number[];
  maxWaitSeconds?: number;
  /** 心跳 / 进度日志前缀（含任务编号用于多并发区分），默认 'gpt' */
  label?: string;
  /** 心跳回调（每 60s 触发一次），用于更新 spinner 等 UI */
  onTick?: (info: { elapsedSeconds: number; progress: number; status: string }) => void;
}

export interface GptImageCommandOptions {
  prompt: string;
  /** 参考图（URL 或本地路径），可重复 */
  input?: string[];
  output?: string;
  model?: string;
  ratio?: string;
  quality?: string;
  background?: string;
  mask?: string;
  seed?: string;
  /** 生成数量，1~5；超过 5 抛错 */
  count?: string;
  overwrite?: boolean;
  pollIntervals?: string;
  maxWait?: string;
  apiKey?: string;
  proxy?: string;
  /** 重试次数（默认 2） */
  retry?: string;
  /** 是否压缩本地参考图（默认 true；文件 > 5MB 时压缩到 < 2MB） */
  compress?: boolean;
  /** 输出结构化 JSON 到 stdout（机器可读），进度日志走 stderr */
  json?: boolean;
}

/* -------------------------------------------------------------------------- */
/* minimax-h3（视频生成，grsai）                                              */
/* -------------------------------------------------------------------------- */

export type MinimaxH3AspectRatio = 'portrait' | 'landscape';
export const MINIMAX_H3_ASPECT_RATIOS: MinimaxH3AspectRatio[] = ['portrait', 'landscape'];

export type MinimaxH3Resolution = '480p' | '768p' | '1080p';
export const MINIMAX_H3_RESOLUTIONS: MinimaxH3Resolution[] = ['480p', '768p', '1080p'];

export interface MinimaxH3GenerateRequest {
  prompt: string;
  /** 最多 9 张参考图（URL 或 base64） */
  images?: string[];
  /** 最多 3 个参考音频（URL 或 base64） */
  audios?: string[];
  aspectRatio: MinimaxH3AspectRatio;
  resolution: MinimaxH3Resolution;
  /** 1~15 秒；1080p 最多 10 秒 */
  duration: number;
  seed?: number;
  replyType?: 'json' | 'stream' | 'async';
  extras?: Record<string, unknown>;
}

export interface MinimaxH3ClientOptions {
  apiKey: string;
  baseUrl?: string;
  proxy?: string;
  timeoutMs?: number;
  pollIntervalsSeconds?: number[];
  maxWaitSeconds?: number;
  /** 心跳 / 进度日志前缀（含任务编号用于多并发区分），默认 'minimax-h3' */
  label?: string;
  /** 心跳回调（每 60s 触发一次），用于更新 spinner 等 UI */
  onTick?: (info: { elapsedSeconds: number; progress: number; status: string }) => void;
}

/* -------------------------------------------------------------------------- */
/* Web 历史记录（grsai web 用）                                              */
/* -------------------------------------------------------------------------- */

export interface HistoryItem {
  id: string;
  prompt: string;
  backend: BackendId;
  model?: string;
  ratio?: string;
  url: string;
  mimeType?: string;
  createdAt: number;
  durationMs?: number;
}

export interface MinimaxH3CommandOptions {
  prompt: string;
  ratio: string;
  resolution: string;
  duration: string;
  input?: string[];
  audio?: string[];
  seed?: string;
  output?: string;
  /** 视频生成数量，1~5 */
  count?: string;
  overwrite?: boolean;
  pollIntervals?: string;
  maxWait?: string;
  apiKey?: string;
  proxy?: string;
  /** 重试次数（默认 2） */
  retry?: string;
  /** 是否压缩本地参考图（默认 true；文件 > 5MB 时压缩到 < 2MB） */
  compress?: boolean;
  /** 输出结构化 JSON 到 stdout（机器可读），进度日志走 stderr */
  json?: boolean;
}