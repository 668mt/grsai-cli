import type {
  BackendInfo,
  GenerateRequest,
  GenerateResponse,
  HistoryItem,
  OptimizeRequest,
  OptimizeResponse,
  TaskStatus,
  UploadResponse,
} from '../types';

const BASE = '/api';

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`${resp.status} ${resp.statusText}: ${text}`);
  }
  return resp.json() as Promise<T>;
}

export const api = {
  /** 拉取后端元信息（后端列表、健康状态等） */
  info: () => http<{ backends: BackendInfo[]; llmConfigured: boolean; outputDir: string }>('/info'),

  /** 上传文件，返回本地 URL + dataUrl（dataUrl 用作 reference） */
  uploadFile: async (file: File): Promise<UploadResponse> => {
    const form = new FormData();
    form.append('file', file);
    const resp = await fetch('/api/upload', {
      method: 'POST',
      body: form,
    });
    if (!resp.ok) {
      throw new Error(`${resp.status} ${resp.statusText}`);
    }
    return resp.json() as Promise<UploadResponse>;
  },

  /** 启动一次生成（同步等待到完成，最长 maxWaitSeconds） */
  generate: (req: GenerateRequest) =>
    http<GenerateResponse>('/generate', {
      method: 'POST',
      body: JSON.stringify(req),
    }),

  /** 主动轮询任务状态 */
  taskStatus: (backend: string, taskId: string) =>
    http<TaskStatus>(`/task/${backend}/${taskId}`),

  /** 用 LLM 优化提示词 */
  optimize: (req: OptimizeRequest) =>
    http<OptimizeResponse>('/optimize', {
      method: 'POST',
      body: JSON.stringify(req),
    }),

  /** 历史记录 */
  history: () => http<HistoryItem[]>('/history'),
  saveHistory: (item: Omit<HistoryItem, 'id' | 'createdAt'>) =>
    http<{ ok: true; item: HistoryItem }>('/history', {
      method: 'POST',
      body: JSON.stringify(item),
    }),
  deleteHistory: (id: string) =>
    http<{ ok: true }>(`/history/${id}`, { method: 'DELETE' }),
  clearHistory: () =>
    http<{ ok: true; removed: number }>('/history', { method: 'DELETE' }),
};