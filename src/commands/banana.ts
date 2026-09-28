/**
 * @Author Martin
 * @Date 2026/9/22
 *
 * paint banana 命令
 *
 * 与 Java GrsaiBananaCli.generate 行为对齐：
 *   - count 限制 1~5
 *   - count>1 时并发跑（对齐 Java ExecutorService + Future）
 *   - 整个生成流程（submit + poll + download）作为原子单元包在 retry 里
 *   - 输出文件命名对齐 DownloadUtils.formatOutput
 *   - overwrite=false 时目标文件已存在抛错
 */

import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import ora from 'ora';
import { BananaClient } from '../api/banana.js';
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
  BananaAspectRatio,
  BananaCommandOptions,
  BananaImageSize,
  BananaModel,
} from '../types/index.js';

const MAX_COUNT = 5;
const RETRY_INTERVAL_MS = 500;

/** 解析用户 --retry 参数（默认 2）；非法值回退默认 */
function parseRetry(raw?: string): number {
  if (raw === undefined) return 2;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 2;
}

export async function runBanana(opts: BananaCommandOptions): Promise<void> {
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

  // reference 规范化：URL 原样，本地路径转 base64
  const images = opts.input && opts.input.length > 0
    ? await normalizeReferences(opts.input)
    : undefined;

  const outputPath = opts.output
    ? resolve(opts.output)
    : resolve(config.outputDir ?? process.cwd());
  // 只创建父目录（不要把 -o 指定的文件路径本身当成目录 mkdir）
  await mkdir(dirnameOf(outputPath), { recursive: true }).catch(() => {});

  const pollIntervalsSeconds = parsePollIntervals(opts.pollIntervals);
  const maxWaitSeconds = opts.maxWait ? Number(opts.maxWait) : undefined;

  // clientOpts 移到 tasks.map 闭包内（需要引用 spinner 和 idx）

  const startTime = Date.now();

  // 打印本次执行的完整配置
  logger.heading('生成配置');
  logger.kv('prompt', opts.prompt);
  logger.kv('model', opts.model ?? 'nano-banana-2');
  if (opts.ratio) logger.kv('ratio', opts.ratio);
  if (opts.size) logger.kv('size', opts.size);
  if (count > 1) logger.kv('count', String(count));
  if (opts.overwrite) logger.kv('overwrite', 'true');
  logger.kv('output', outputPath);
  if (opts.input && opts.input.length > 0) {
    logger.kv('reference', `${opts.input.length} 张`);
  }

  // 为每张图生成最终落盘路径（对齐 formatOutput）
  const targets = Array.from({ length: count }, (_, i) =>
    formatOutput(outputPath, 'png', count > 1 ? i + 1 : null),
  );

  // 已存在检查（count>1 时也提前校验）
  if (!opts.overwrite) {
    for (const t of targets) {
      if (existsSync(t)) {
        throw new Error(`目标文件已存在：${t}（如需覆盖请加 --overwrite）`);
      }
    }
  }

  // 并发跑 count 张图（对齐 ExecutorService.newFixedThreadPool(count)）
  const tasks = targets.map((target, idx) => async () => {
    const taskStart = Date.now();
    const spinner = ora({
      text: `[banana ${idx + 1}/${count}] 提交并轮询...`,
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
      label: `banana ${idx + 1}/${count}`,
      onTick: ({ elapsedSeconds: e, progress }: { elapsedSeconds: number; progress: number }) => {
        spinner.text = `[banana ${idx + 1}/${count}] 轮询中 · 已等待 ${formatElapsed(e)} · 进度 ${progress}%`;
      },
    };

    try {
      // 整段（submit + poll + download）作为重试单元（对齐 Java RetryUtils.execute(fn, 1, 500)）
      const result = await execute(async () => {
        const client = new BananaClient(clientOpts);
        const task = await client.runTask({
          prompt: opts.prompt,
          images,
          model: opts.model as BananaModel | undefined,
          aspectRatio: opts.ratio as BananaAspectRatio | undefined,
          imageSize: opts.size as BananaImageSize | undefined,
          replyType: 'async',
        });

        const urls = (task.results ?? []).map(r => r.url);
        if (urls.length === 0) throw new Error('任务完成但未返回图片 URL');
        const first = urls[0]!;
        // 只下载第一张图到目标文件（对齐 Java GrsaiBananaCli 行为）
        const saved = await downloadSingle(first, {
          output: target,
          proxy: clientOpts.proxy,
          timeoutMs: clientOpts.timeoutMs,
          overwrite: !!opts.overwrite,
        });
        return saved;
      }, { maxRetries: parseRetry(opts.retry), intervalMs: RETRY_INTERVAL_MS });

      const duration = Date.now() - taskStart;
      spinner.stop();
      logger.done(`[banana ${idx + 1}/${count}] ${result}`, duration);
      return result;
    } catch (e) {
      const duration = Date.now() - taskStart;
      spinner.fail(`[banana ${idx + 1}/${count}] 失败：${(e as Error).message} (${logger.fmtDuration(duration)})`);
      throw e;
    }
  });

  const results = await runWithConcurrency(tasks);
  const totalDuration = Date.now() - startTime;
  logger.success(`全部完成 ${results.length}/${count} 张 · 总耗时 ${logger.fmtDuration(totalDuration)}`);
}

/**
 * 并发执行所有任务，任一失败不影响其他任务继续
 * （对齐 Java Future.get 收集异常的方式）
 */
async function runWithConcurrency(
  tasks: Array<() => Promise<string>>,
): Promise<string[]> {
  const out: string[] = [];
  const errors: Error[] = [];
  await Promise.all(
    tasks.map(async (task) => {
      try {
        const r = await task();
        out.push(r);
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

function formatElapsed(seconds: number): string {
  const total = Math.floor(seconds);
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return s === 0 ? `${m}m` : `${m}m${s}s`;
}

function parsePollIntervals(raw?: string): number[] | undefined {
  if (!raw) return undefined;
  return raw.split(',').map(s => Number.parseInt(s.trim(), 10)).filter(n => Number.isFinite(n) && n > 0);
}