/**
 * @Author Martin
 * @Date 2026/9/22
 *
 * paint minimax-h3 命令（视频生成；与 banana/gpt 同架构）
 */

import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import ora from 'ora';
import { MinimaxH3Client } from '../api/minimaxH3.js';
import {
  downloadImage as downloadSingle,
  formatOutput,
  normalizeReferences,
} from '../utils/download.js';
import { dirname as dirnameOf } from 'node:path';
import { loadConfig, resolveApiKey } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { execute } from '../utils/retry.js';
import type {
  MinimaxH3AspectRatio,
  MinimaxH3CommandOptions,
  MinimaxH3Resolution,
} from '../types/index.js';

const MAX_COUNT = 5;
const RETRY_INTERVAL_MS = 500;

/** 解析用户 --retry 参数（默认 2）；非法值回退默认 */
function parseRetry(raw?: string): number {
  if (raw === undefined) return 2;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 2;
}

export async function runMinimaxH3(opts: MinimaxH3CommandOptions): Promise<void> {
  const count = parseCount(opts.count);
  if (count < 1 || count > MAX_COUNT) {
    throw new Error(`count 必须在 1~${MAX_COUNT} 之间，当前：${count}`);
  }

  const config = await loadConfig();
  const apiKey = resolveApiKey(config, opts.apiKey);
  if (!apiKey) {
    throw new Error(
      '缺少 grsai API Key，请通过 -k 指定或运行 grsai config set --api-key <KEY>',
    );
  }

  const images = opts.input && opts.input.length > 0
    ? await normalizeReferences(opts.input)
    : undefined;

  // audios 只接受 URL 或 base64，不做本地路径→base64（音频 base64 体积大）
  const audios = opts.audio && opts.audio.length > 0 ? opts.audio : undefined;

  const outputPath = opts.output
    ? resolve(opts.output)
    : resolve(config.outputDir ?? process.cwd());
  // 只创建父目录（不要把 -o 指定的文件路径本身当成目录 mkdir）
  await mkdir(dirnameOf(outputPath), { recursive: true }).catch(() => {});

  const pollIntervalsSeconds = parsePollIntervals(opts.pollIntervals);
  const maxWaitSeconds = opts.maxWait ? Number(opts.maxWait) : undefined;

  const startTime = Date.now();

  // 把 resolution/duration 提前声明（用于配置打印）
  const resolution = opts.resolution as MinimaxH3Resolution;
  const duration = Number(opts.duration);

  // 打印本次执行的完整配置
  logger.heading('生成配置');
  logger.kv('prompt', opts.prompt);
  logger.kv('ratio', opts.ratio);
  logger.kv('resolution', resolution);
  logger.kv('duration', `${duration}s`);
  if (count > 1) logger.kv('count', String(count));
  if (opts.overwrite) logger.kv('overwrite', 'true');
  logger.kv('output', outputPath);
  if (opts.input && opts.input.length > 0) {
    logger.kv('reference', `${opts.input.length} 张`);
  }
  if (opts.audio && opts.audio.length > 0) {
    logger.kv('audio', `${opts.audio.length} 个`);
  }
  if (opts.seed !== undefined) logger.kv('seed', String(opts.seed));

  // 视频默认 .mp4 后缀
  const targets = Array.from({ length: count }, (_, i) =>
    formatOutput(outputPath, 'mp4', count > 1 ? i + 1 : null),
  );

  if (!opts.overwrite) {
    for (const t of targets) {
      if (existsSync(t)) {
        throw new Error(`目标文件已存在：${t}（如需覆盖请加 --overwrite）`);
      }
    }
  }

  const tasks = targets.map((target, idx) => async () => {
    const taskStart = Date.now();
    const spinner = ora({
      text: `[minimax-h3 ${idx + 1}/${count}] 提交并轮询 (${resolution}, ${duration}s)...`,
      color: 'cyan',
    }).start();

    // 心跳回调：更新 spinner.text（避免 ora spinner 覆盖心跳日志）
    const clientOpts = {
      apiKey,
      baseUrl: process.env.GRSAI_BASE_URL,
      proxy: opts.proxy ?? config.proxy,
      timeoutMs: config.timeoutMs,
      pollIntervalsSeconds,
      maxWaitSeconds,
      // label 带上任务编号，多并发时 stderr 日志能区分是哪张图
      label: `minimax-h3 ${idx + 1}/${count}`,
      onTick: ({ elapsedSeconds: e, progress }: { elapsedSeconds: number; progress: number }) => {
        spinner.text = `[minimax-h3 ${idx + 1}/${count}] 轮询中 · 已等待 ${formatElapsed(e)} · 进度 ${progress}%`;
      },
    };

    try {
      const result = await execute(async () => {
        const client = new MinimaxH3Client(clientOpts);
        const task = await client.runVideo({
          prompt: opts.prompt,
          images,
          audios,
          aspectRatio: opts.ratio as MinimaxH3AspectRatio,
          resolution,
          duration,
          seed: opts.seed ? Number(opts.seed) : undefined,
          replyType: 'async',
        });
        const urls = (task.results ?? []).map(r => r.url);
        if (urls.length === 0) throw new Error('任务完成但未返回视频 URL');
        const first = urls[0]!;
        return downloadSingle(first, {
          output: target,
          proxy: clientOpts.proxy,
          timeoutMs: clientOpts.timeoutMs,
          overwrite: !!opts.overwrite,
        });
      }, { maxRetries: parseRetry(opts.retry), intervalMs: RETRY_INTERVAL_MS });

      const durationMs = Date.now() - taskStart;
      spinner.stop();
      logger.done(`[minimax-h3 ${idx + 1}/${count}] ${result}`, durationMs);
      return result;
    } catch (e) {
      const durationMs = Date.now() - taskStart;
      spinner.fail(`[minimax-h3 ${idx + 1}/${count}] 失败：${(e as Error).message} (${logger.fmtDuration(durationMs)})`);
      throw e;
    }
  });

  const results = await runWithConcurrency(tasks);
  const totalDuration = Date.now() - startTime;
  logger.success(`全部完成 ${results.length}/${count} 个 · 总耗时 ${logger.fmtDuration(totalDuration)}`);
}

async function runWithConcurrency(
  tasks: Array<() => Promise<string>>,
): Promise<string[]> {
  const out: string[] = [];
  const errors: Error[] = [];
  await Promise.all(
    tasks.map(async (task) => {
      try {
        out.push(await task());
      } catch (e) {
        errors.push(e as Error);
      }
    }),
  );
  if (errors.length > 0 && out.length === 0) {
    throw errors[0];
  }
  return out;
}

function parseCount(raw?: string): number {
  if (!raw) return 1;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function parsePollIntervals(raw?: string): number[] | undefined {
  if (!raw) return undefined;
  return raw.split(',').map(s => Number.parseInt(s.trim(), 10)).filter(n => Number.isFinite(n) && n > 0);
}

function formatElapsed(seconds: number): string {
  const total = Math.floor(seconds);
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return s === 0 ? `${m}m` : `${m}m${s}s`;
}