/**
 * 前端类型定义
 */

export type BackendId = 'banana' | 'gpt-image' | 'minimax-h3';

export interface BackendInfo {
  id: BackendId;
  displayName: string;
  kind: 'image' | 'video';
  models: Array<{ id: string; label: string }>;
  options: Array<{
    key: 'ratio' | 'size' | 'quality' | 'duration' | 'resolution';
    label: string;
    type: 'select' | 'number';
    choices?: string[];
    default?: string;
    min?: number;
    max?: number;
  }>;
}

export interface GenerateRequest {
  backend: BackendId;
  prompt: string;
  model?: string;
  ratio?: string;
  size?: string;
  quality?: string;
  duration?: number;
  resolution?: string;
  count?: number;
  /** 参考图（dataUrl 数组） */
  images?: string[];
}

export interface GenerateResponse {
  taskId: string;
  status: 'succeeded' | 'failed' | 'violation';
  results: Array<{ url: string; mimeType?: string }>;
  error?: string;
  durationMs: number;
}

export interface TaskStatus {
  id: string;
  status: 'running' | 'succeeded' | 'failed' | 'violation';
  progress?: number;
  results?: Array<{ url: string }>;
  error?: string;
}

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

export interface OptimizeRequest {
  prompt: string;
  backend: BackendId;
  /** 当前选的模型 */
  model?: string;
  /** 比例 / 像素 */
  ratio?: string;
  /** 图片尺寸（1K/2K/4K） */
  size?: string;
  /** 质量档 */
  quality?: string;
  /** 视频时长 */
  duration?: number;
  /** 视频分辨率 */
  resolution?: string;
}

export interface OptimizeResponse {
  /** 3 个候选（未配置 LLM 时只有原 prompt 一个） */
  variants: string[];
}

/** 上传文件返回结构 */
export interface UploadResponse {
  filename: string;
  url: string;       // 本地访问路径 /files/xxx
  name: string;      // 原始文件名
  size: number;
  mimeType: string;
  dataUrl: string;   // data:image/...;base64,... 可直接作为 reference
}

/** 参考图（reference）项 */
export interface Reference {
  /** 用于前端显示（本地 URL 或上传时的预览） */
  preview: string;
  /** 用于发给后端的 reference（dataUrl 优先，因为 grsai 在云端访问不到 localhost） */
  dataUrl: string;
  name: string;
}