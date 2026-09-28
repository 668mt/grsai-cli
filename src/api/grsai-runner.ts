/**
 * @Author Martin
 * @Date 2026/9/22
 *
 * Grsai 通用任务运行器（对齐 ai-stdio 中 GrsaiApi 的轮询逻辑）
 *
 * 适配所有走 /v1/api/generate + /v1/api/result 的 Grsai 模型。
 *
 * 轮询策略（与 Java GrsaiApi.pollDrawResult 一致）：
 *   - 动态退避：默认 5/5/10 秒（前 3 次分别 5s/5s/10s，之后固定 10s）
 *   - 总超时阈值，超时直接抛错
 *   - 状态机：running -> sleep 重试；succeeded -> 返回；failed/violation -> 抛错（含 failure_reason）
 *   - 业务 code=-22 表示任务不存在，立即抛错
 *
 * 注意：本文件所有"等待/超时"相关字段单位都是**秒**；单次 HTTP 超时仍是毫秒（timeoutMs）。
 */

import type { BananaTaskResult } from '../types/index.js';
import { createHttpClient } from '../utils/http.js';
import { logger } from '../utils/logger.js';

const DEFAULT_BASE_URL = 'https://grsai.dakka.com.cn';

/** 默认轮询间隔（秒），与 Java GrsaiApi.pollIntervals 一致 */
const DEFAULT_POLL_INTERVALS_SECONDS: number[] = [5, 5, 10];

/** 默认最大等待时间：600 秒（10 分钟） */
const DEFAULT_MAX_WAIT_SECONDS = 600;

/** 心跳日志间隔（秒）：每 30s 打印一次当前进度 */
const HEARTBEAT_INTERVAL_SECONDS = 30;

export interface GrsaiTaskRunnerOptions {
  apiKey: string;
  /** grsai 基础节点，默认 https://grsai.dakka.com.cn */
  baseUrl?: string;
  proxy?: string;
  /** 单次 HTTP 超时（毫秒） */
  timeoutMs?: number;
  /** 轮询间隔（秒），默认 [5, 5, 10] */
  pollIntervalsSeconds?: number[];
  /** 总超时（秒），默认 600（10 分钟） */
  maxWaitSeconds?: number;
  /** 日志标签（用于心跳前缀），默认 "grsai" */
  label?: string;
  /** 心跳回调（每 60s 触发一次），用于更新 spinner 等 UI */
  onTick?: (info: { elapsedSeconds: number; progress: number; status: string }) => void;
}

export interface GrsaiRunOptions {
  /** 提交任务的 payload（已包含 model/prompt/...） */
  payload: Record<string, unknown>;
  /** 提交路径，默认 /v1/api/generate */
  submitPath?: string;
  /** 查询路径，默认 /v1/api/result */
  queryPath?: string;
}

/**
 * Grsai 任务运行器：异步提交 + 阻塞轮询
 */
export class GrsaiTaskRunner {
  private apiKey: string;
  private baseUrl: string;
  private proxy?: string;
  private timeoutMs: number;
  private pollIntervalsSeconds: number[];
  private maxWaitSeconds: number;
  private label: string;
  private onTick?: (info: { elapsedSeconds: number; progress: number; status: string }) => void;

  constructor(options: GrsaiTaskRunnerOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl
      ?? process.env.GRSAI_BASE_URL
      ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.proxy = options.proxy;
    this.timeoutMs = options.timeoutMs ?? 180_000;
    this.pollIntervalsSeconds = options.pollIntervalsSeconds ?? DEFAULT_POLL_INTERVALS_SECONDS;
    this.maxWaitSeconds = options.maxWaitSeconds ?? DEFAULT_MAX_WAIT_SECONDS;
    this.label = options.label ?? 'grsai';
    this.onTick = options.onTick;
  }

  /**
   * 完整跑一次任务：提交 + 轮询 + 返回最终结果
   */
  async run(opts: GrsaiRunOptions): Promise<BananaTaskResult> {
    const taskId = await this.submit(opts);
    logger.step(`任务已提交：${taskId}`);
    return this.pollUntilDone(taskId, opts.queryPath);
  }

  /**
   * 仅提交任务，返回 taskId
   */
  async submit(opts: GrsaiRunOptions): Promise<string> {
    const http = createHttpClient({
      proxy: this.proxy,
      timeoutMs: this.timeoutMs,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    const url = `${this.baseUrl}${opts.submitPath ?? '/v1/api/generate'}`;
    // 强制 replyType=async 以拿到 taskId
    const payload = { replyType: 'async', ...opts.payload };

    const resp = await http<{ id?: string; status?: string; error?: string }>(
      url,
      { method: 'POST', body: payload },
    );

    if (!resp.id) {
      throw new Error(`Grsai 提交失败：${resp.error ?? '未返回 taskId'}`);
    }
    return resp.id;
  }

  /**
   * 单次查询任务状态
   */
  async fetchTask(taskId: string, queryPath?: string): Promise<BananaTaskResult> {
    const http = createHttpClient({
      proxy: this.proxy,
      timeoutMs: this.timeoutMs,
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    return http<BananaTaskResult>(
      `${this.baseUrl}${queryPath ?? '/v1/api/result'}`,
      { method: 'GET', query: { id: taskId } },
    );
  }

  /**
   * 阻塞式轮询直到任务结束（与 Java GrsaiApi.pollDrawResult 行为一致）
   */
  async pollUntilDone(taskId: string, queryPath?: string): Promise<BananaTaskResult> {
    const startTime = Date.now();
    let pollIndex = 0;
    let lastProgress = 0;
    let lastHeartbeatSeconds = 0;

    while (true) {
      const elapsedSeconds = (Date.now() - startTime) / 1000;
      if (elapsedSeconds >= this.maxWaitSeconds) {
        throw new Error(
          `轮询超时（${this.maxWaitSeconds}s），任务id: ${taskId}`,
        );
      }

      const result = await this.fetchTask(taskId, queryPath);

      logger.debug(`轮询 #${pollIndex + 1}，状态: ${result.status}`);

      // running：等下次
      if (result.status === 'running') {
        const progress = result.progress ?? 0;

        // 心跳：每 60s 触发一次（优先用 onTick 回调，避免 ora spinner 覆盖 stdout）
        if (elapsedSeconds - lastHeartbeatSeconds >= HEARTBEAT_INTERVAL_SECONDS) {
          // 1) 优先调回调（让 spinner.text 更新）
          if (this.onTick) {
            try {
              this.onTick({ elapsedSeconds, progress, status: 'running' });
            } catch {
              /* 回调失败不影响轮询 */
            }
          }
          // 2) 同时打 stderr 行（无 spinner 时能直接看到）
          logger.tick(
            `[${this.label}] 轮询中 · 已等待 ${this.formatElapsed(elapsedSeconds)} · 进度 ${progress}%`,
          );
          lastHeartbeatSeconds = elapsedSeconds;
        }

        if (progress !== lastProgress) {
          // 进度变化时打 stderr（不被 ora spinner 覆盖）
          logger.tick(
            `[${this.label}] 进度更新 ${lastProgress}% → ${progress}%`,
          );
          lastProgress = progress;
        }
      } else if (result.status === 'succeeded') {
        if (!result.results || result.results.length === 0) {
          throw new Error('Grsai 任务成功但未返回结果（results 为空）');
        }
        return result;
      } else if (result.status === 'violation' || result.status === 'failed') {
        const tips = '"output_moderation" 输出违规; "input_moderation" 输入违规; "error" 其他错误';
        throw new Error(
          `Grsai 任务${result.status === 'violation' ? '违规' : '失败'}：`
          + `failure_reason=${result.failureReason ?? 'n/a'}, error=${result.error ?? 'n/a'}。tips: ${tips}`,
        );
      } else {
        logger.warn(`未知状态：${result.status}，继续轮询`);
      }

      // 业务 code=-22：任务不存在
      if (result.code === -22) {
        throw new Error(`Grsai 任务不存在：${taskId}`);
      }

      // 动态退避间隔（秒）
      const sleepSeconds = this.computeSleepSeconds(pollIndex, elapsedSeconds);
      pollIndex += 1;
      await sleep(sleepSeconds * 1000);
    }
  }

  /**
   * 计算本次轮询后的等待时间（秒，与 Java GrsaiApi.pollIntervals 一致）
   */
  private computeSleepSeconds(pollIndex: number, elapsedSeconds: number): number {
    const idx = Math.min(pollIndex, this.pollIntervalsSeconds.length - 1);
    const base = this.pollIntervalsSeconds[idx]!;
    const remaining = this.maxWaitSeconds - elapsedSeconds;
    return Math.max(1, Math.min(base, Math.max(remaining, 1)));
  }

  /**
   * 把秒数格式化成可读时长（用于心跳日志）
   */
  private formatElapsed(seconds: number): string {
    const total = Math.floor(seconds);
    if (total < 60) return `${total}s`;
    const minutes = Math.floor(total / 60);
    const secs = total - minutes * 60;
    return secs === 0 ? `${minutes}m` : `${minutes}m${secs}s`;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}