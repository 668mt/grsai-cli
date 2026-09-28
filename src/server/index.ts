/**
 * @Author Martin
 * @Date 2026/9/22
 *
 * grsai web 后端服务（Hono）
 *
 * 职责：
 *   1. 提供 /api/* 路由（info / generate / task / optimize / history）
 *   2. 静态文件 serve web/dist/
 *   3. 复用 ai-paint 的 BananaClient / GptImageClient / MinimaxH3Client
 *   4. 复用 ~/.grsai/config.json 里的 API Key（前端不接触密钥）
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { logger } from '../utils/logger.js';
import { resolveApiKey, loadConfig } from '../utils/config.js';
import { BananaClient } from '../api/banana.js';
import { GptImageClient } from '../api/gpt.js';
import { MinimaxH3Client } from '../api/minimaxH3.js';
import {
  addHistory,
  clearHistory,
  deleteHistory,
  getHistoryItem,
  listHistory,
} from './history.js';
import { isLlmConfigured, optimizePrompt } from './optimizer.js';
import { getWebOutputDir, readWebFile, saveToLocal, saveUploadedFile } from './files.js';
import type {
  BackendId,
  BananaAspectRatio,
  BananaImageSize,
  BananaModel,
  BananaTaskResult,
  GptImageBackground,
  GptImageModel,
  GptImageQuality,
  MinimaxH3AspectRatio,
  MinimaxH3Resolution,
} from '../types/index.js';

// web/dist 相对 CLI 启动目录（用户运行 `grsai web` 时所在的目录）
const WEB_DIST = resolve(process.cwd(), 'web/dist');

/** Web 前端到后端的请求结构（与 src/types/index.ts 的 GenerateRequest 不同） */
interface WebGenerateRequest {
  backend: BackendId;
  prompt: string;
  model?: string;
  ratio?: string;
  size?: string;
  quality?: string;
  background?: string;
  resolution?: string;
  duration?: number;
  count?: number;
  /** 参考图（dataUrl 数组，前端上传后转 base64 传过来） */
  images?: string[];
}

/** 后端静态描述（暴露给前端用） */
function describeBackends() {
  return [
    {
      id: 'banana',
      displayName: 'nano-banana (grsai)',
      kind: 'image' as const,
      models: [
        { id: 'nano-banana-2', label: 'nano-banana-2 (默认)' },
        { id: 'nano-banana-fast', label: 'nano-banana-fast' },
        { id: 'nano-banana-pro', label: 'nano-banana-pro' },
      ],
      options: [
        { key: 'ratio', label: '宽高比', type: 'select', choices: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', 'auto'], default: '1:1' },
        { key: 'size', label: '分辨率', type: 'select', choices: ['1K', '2K', '4K'], default: '1K' },
      ],
    },
    {
      id: 'gpt-image',
      displayName: 'gpt-image-2 / 2.5 (grsai)',
      kind: 'image' as const,
      models: [
        { id: 'gpt-image-2', label: 'gpt-image-2 (默认)' },
        { id: 'gpt-image-2.5', label: 'gpt-image-2.5' },
        { id: 'gpt-image-2-vip', label: 'gpt-image-2-vip' },
      ],
      options: [
        { key: 'ratio', label: '比例/像素', type: 'select', choices: ['1024x1024', '1536x1024', '1024x1536', '1:1', '16:9', '9:16'], default: '1024x1024' },
        { key: 'quality', label: '质量', type: 'select', choices: ['auto', 'low', 'medium', 'high', 'xhigh', 'max'], default: 'auto' },
      ],
    },
    {
      id: 'minimax-h3',
      displayName: 'minimax-h3 视频 (grsai)',
      kind: 'video' as const,
      models: [{ id: 'minimax-h3', label: 'minimax-h3' }],
      options: [
        { key: 'ratio', label: '画幅', type: 'select', choices: ['portrait', 'landscape'], default: 'portrait' },
        { key: 'resolution', label: '分辨率', type: 'select', choices: ['480p', '768p', '1080p'], default: '768p' },
        { key: 'duration', label: '时长(秒)', type: 'number', min: 1, max: 15, default: '6' },
      ],
    },
  ];
}

/**
 * 启动 web 服务
 */
export async function startWebServer(opts: {
  port: number;
  open?: boolean;
}): Promise<{ port: number; url: string; close: () => void }> {
  const config = await loadConfig();
  const apiKey = resolveApiKey(config);
  if (!apiKey) {
    logger.error('未配置 grsai API Key，请先运行 `grsai config set --api-key <KEY>`');
    process.exit(1);
  }

  // 把配置文件里的 LLM 设置加载到 process.env（让 optimizer 能读到）
  if (config.llmApiKey) process.env.LLM_API_KEY = config.llmApiKey;
  if (config.llmBaseUrl) process.env.LLM_BASE_URL = config.llmBaseUrl;
  if (config.llmModel) process.env.LLM_MODEL = config.llmModel;

  const llmConfigured = isLlmConfigured();

  const app = new Hono();

  // 全局错误处理
  app.onError((err, c) => {
    logger.error(`[web] ${err.message}`);
    return c.json({ error: err.message }, 500);
  });

  // CORS（开发场景，Vite 走 5173、服务端走 5174）
  app.use('*', async (c, next) => {
    c.header('Access-Control-Allow-Origin', '*');
    c.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type');
    if (c.req.method === 'OPTIONS') {
      return c.body(null, 204);
    }
    await next();
    return;
  });

  // ============ API 路由 ============

  /** 后端元信息 */
  app.get('/api/info', (c) => {
    return c.json({
      backends: describeBackends(),
      llmConfigured,
      outputDir: getWebOutputDir(config),
    });
  });

  /** 上传文件（multipart/form-data） */
  app.post('/api/upload', async (c) => {
    const contentType = c.req.header('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
      return c.json(
        { error: `需要 multipart/form-data，当前 content-type: ${contentType}` },
        400,
      );
    }
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) {
      return c.json(
        {
          error: `缺少 file 字段`,
          got: Object.keys(body),
          fieldTypes: Object.fromEntries(
            Object.entries(body).map(([k, v]) => [k, Array.isArray(v) ? `array<${v.length}>` : typeof v]),
          ),
        },
        400,
      );
    }
    const result = await saveUploadedFile(config, file);
    // 同时返回 dataUrl，方便前端作为 reference 直接传给 grsai
    const buffer = await file.arrayBuffer();
    const dataUrl = `data:${file.type || 'image/png'};base64,${Buffer.from(buffer).toString('base64')}`;
    return c.json({
      filename: result.filename,
      url: result.url,
      name: file.name,
      size: file.size,
      mimeType: file.type,
      dataUrl,
    });
  });

  /** 本地文件访问（/files/:filename） */
  app.get('/files/:filename', async (c) => {
    const filename = c.req.param('filename');
    const file = await readWebFile(config, filename);
    if (!file) return c.text('not found', 404);
    // Hono 要求 Uint8Array 而不是 Buffer
    return c.body(new Uint8Array(file.buffer), 200, {
      'Content-Type': file.mime,
      'Cache-Control': 'public, max-age=31536000',
    });
  });

  /** 健康检查 */
  app.get('/api/health', (c) => c.json({ ok: true, llmConfigured }));

  /** 提示词优化（返回 3 个变体让用户选） */
  app.post('/api/optimize', async (c) => {
    const body = await c.req.json<{
      prompt: string;
      backend: BackendId;
      model?: string;
      ratio?: string;
      size?: string;
      quality?: string;
      duration?: number;
      resolution?: string;
    }>();
    if (!body.prompt?.trim()) {
      return c.json({ error: 'prompt 不能为空' }, 400);
    }
    const variants = await optimizePrompt({
      prompt: body.prompt,
      backend: body.backend,
      model: body.model,
      ratio: body.ratio,
      size: body.size,
      quality: body.quality,
      duration: body.duration,
      resolution: body.resolution,
      llmApiKey: process.env.LLM_API_KEY,
      llmBaseUrl: process.env.LLM_BASE_URL,
      llmModel: process.env.LLM_MODEL,
    });
    return c.json({ variants });
  });

  /** 同步生成（等待到完成，最长 600s） */
  app.post('/api/generate', async (c) => {
    const body = await c.req.json<WebGenerateRequest>();
    const started = Date.now();
    try {
      const result = await runGenerate(body, apiKey);
      // 把结果 URL 下载到本地（替换 grsai 临时 URL 为 /files/xxx.png）
      const localResults = await Promise.all(
        result.results.map(async (r) => {
          const ext = r.mimeType?.startsWith('video/') ? '.mp4' : undefined;
          const filename = await saveToLocal(config, r.url, ext);
          return filename
            ? { url: `/files/${filename}`, mimeType: r.mimeType, local: true }
            : { url: r.url, mimeType: r.mimeType, local: false }; // 失败时保留原 URL
        }),
      );
      return c.json({
        ...result,
        results: localResults,
        durationMs: Date.now() - started,
      });
    } catch (e) {
      logger.error(`[web] 生成失败：${(e as Error).message}`);
      return c.json({
        taskId: '',
        status: 'failed' as const,
        results: [],
        error: (e as Error).message,
        durationMs: Date.now() - started,
      });
    }
  });

  /** 查询任务状态 */
  app.get('/api/task/:backend/:taskId', async (c) => {
    const backend = c.req.param('backend') as BackendId;
    const taskId = c.req.param('taskId');
    try {
      const task = await queryTask(backend, taskId, apiKey);
      return c.json(task);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 500);
    }
  });

  // ============ History ============
  app.get('/api/history', async (c) => c.json(await listHistory()));

  app.post('/api/history', async (c) => {
    const body = await c.req.json();
    const item = await addHistory(body);
    return c.json({ ok: true, item });
  });

  app.delete('/api/history/:id', async (c) => {
    const id = c.req.param('id');
    const ok = await deleteHistory(id);
    return c.json({ ok });
  });

  /** 清空全部历史 */
  app.delete('/api/history', async (c) => {
    const count = await clearHistory();
    return c.json({ ok: true, removed: count });
  });

  /** 历史图片代理（直接转发到 grsai URL） */
  app.get('/api/history/:id/thumb', async (c) => {
    const id = c.req.param('id');
    const item = await getHistoryItem(id);
    if (!item) return c.text('not found', 404);

    // 本地路径（/files/xxx）：直接读文件，避免循环 fetch
    if (item.url.startsWith('/files/')) {
      const filename = item.url.slice('/files/'.length);
      const file = await readWebFile(config, filename);
      if (!file) return c.text('local file not found', 404);
      return c.body(new Uint8Array(file.buffer), 200, {
        'Content-Type': item.mimeType ?? file.mime,
      });
    }

    // 远程路径（grsai 临时 URL）：fetch 代理
    try {
      const resp = await fetch(item.url);
      const buf = Buffer.from(await resp.arrayBuffer());
      return c.body(new Uint8Array(buf), 200, {
        'Content-Type': item.mimeType ?? 'image/png',
      });
    } catch (e) {
      return c.text(`fetch failed: ${(e as Error).message}`, 502);
    }
  });

  // ============ 静态文件 ============
  if (existsSync(WEB_DIST)) {
    app.use('/*', serveStatic({ root: WEB_DIST.replace(/\\/g, '/') }));
    // SPA fallback：所有非 /api/* 的 GET 路由都返回 index.html
    app.get('*', async (c) => {
      const indexHtml = await readFile(join(WEB_DIST, 'index.html'), 'utf-8');
      return c.html(indexHtml);
    });
  } else {
    app.get('/', (c) =>
      c.text(
        `grsai web 后端已启动（端口 ${opts.port}），但 web/dist/ 不存在。\n` +
          `请先运行: cd web && pnpm install && pnpm build`,
      ),
    );
  }

  // 启动服务
  const server = serve({
    fetch: app.fetch,
    port: opts.port,
  });

  const url = `http://localhost:${opts.port}`;
  logger.success(`grsai web 已启动: ${url}`);
  if (llmConfigured) {
    logger.info('✨ agent 提示词优化已启用');
  } else {
    logger.warn('⚠ agent 未启用（运行 `grsai config set --llm-api-key <KEY>` 配置）');
  }

  if (opts.open !== false) {
    void openBrowser(url);
  }

  return {
    port: opts.port,
    url,
    close: () => server.close(),
  };
}

/* -------------------------------------------------------------------------- */
/* 内部辅助                                                                   */
/* -------------------------------------------------------------------------- */

async function runGenerate(
  req: WebGenerateRequest,
  apiKey: string,
): Promise<{
  taskId: string;
  status: 'succeeded' | 'failed' | 'violation';
  results: Array<{ url: string; mimeType?: string }>;
  error?: string;
}> {
  const baseOpts = {
    apiKey,
    baseUrl: process.env.GRSAI_BASE_URL,
  };

  if (req.backend === 'banana') {
    const client = new BananaClient(baseOpts);
    const task = await client.runTask({
      prompt: req.prompt,
      images: req.images,   // 传入参考图（dataUrl 数组）
      model: req.model as BananaModel | undefined,
      aspectRatio: req.ratio as BananaAspectRatio | undefined,
      imageSize: req.size as BananaImageSize | undefined,
      replyType: 'async',
    });
    return finalize(task);
  }

  if (req.backend === 'gpt-image') {
    const client = new GptImageClient(baseOpts);
    const task = await client.runTask({
      prompt: req.prompt,
      images: req.images,
      model: req.model as GptImageModel | undefined,
      aspectRatio: req.ratio,
      quality: req.quality as GptImageQuality | undefined,
      background: req.background as GptImageBackground | undefined,
      replyType: 'async',
    });
    return finalize(task);
  }

  if (req.backend === 'minimax-h3') {
    const client = new MinimaxH3Client(baseOpts);
    const task = await client.runVideo({
      prompt: req.prompt,
      images: req.images,
      aspectRatio: (req.ratio ?? 'portrait') as MinimaxH3AspectRatio,
      resolution: (req.resolution ?? '768p') as MinimaxH3Resolution,
      duration: req.duration ?? 6,
      replyType: 'async',
    });
    return {
      taskId: task.id,
      status: task.status === 'succeeded'
        ? 'succeeded'
        : task.status === 'running'
          ? 'failed'
          : (task.status as 'failed' | 'violation'),
      results: (task.results ?? []).map(r => ({
        url: r.url,
        mimeType: 'video/mp4',
      })),
      error: task.error,
    };
  }

  throw new Error(`未知后端：${req.backend}`);
}

function finalize(task: BananaTaskResult) {
  return {
    taskId: task.id,
    status: task.status as 'succeeded' | 'failed' | 'violation',
    results: (task.results ?? []).map(r => ({ url: r.url })),
    error: task.error,
  };
}

async function queryTask(backend: BackendId, taskId: string, apiKey: string) {
  const baseOpts = { apiKey, baseUrl: process.env.GRSAI_BASE_URL };

  if (backend === 'banana') {
    return new BananaClient(baseOpts).fetchTask(taskId);
  }
  if (backend === 'gpt-image') {
    return new GptImageClient(baseOpts).fetchTask(taskId);
  }
  if (backend === 'minimax-h3') {
    return new MinimaxH3Client(baseOpts).fetchTask(taskId);
  }
  throw new Error(`未知后端：${backend}`);
}

async function openBrowser(url: string) {
  const { spawn } = await import('node:child_process');
  try {
    if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' });
    } else if (process.platform === 'win32') {
      // Windows 上 start 必须通过 cmd shell 调用
      spawn('cmd', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore' });
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
    }
  } catch {
    // ignore
  }
}