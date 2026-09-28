/**
 * @Author Martin
 * @Date 2026/9/22
 *
 * 重试工具（对应 ai-stdio 中 mt.spring.ai.utils.RetryUtils 的 TypeScript 实现）
 *
 * 用法：
 *   await execute(() => draw(), { maxRetries: 1, intervalMs: 500 });
 *   await executeWithExponentialBackoff(() => draw(), 3, 1000);
 */

import { logger } from './logger.js';

export type Retryable<T> = () => Promise<T> | T;

export interface RetryOptions {
  /** 最大重试次数（不含首次尝试）；execute(fn, 1, 500) 表示总共 2 次尝试 */
  maxRetries: number;
  /** 重试间隔（毫秒）；exponential=true 时作为基数 */
  intervalMs: number;
  /** 是否使用指数退避：interval * 2^n */
  exponential?: boolean;
  /** 仅对列出的异常类型重试；不传则对所有 Error 重试 */
  retryableExceptions?: Array<new (...args: never[]) => Error>;
  /** 重试前回调（attempt 从 1 开始） */
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
}

/**
 * 执行带重试的操作（与 Java RetryUtils.execute 行为一致）
 */
export async function execute<T>(
  fn: Retryable<T>,
  options: RetryOptions,
): Promise<T> {
  const {
    maxRetries,
    intervalMs,
    exponential = false,
    retryableExceptions,
    onRetry,
  } = options;

  const maxAttempts = maxRetries + 1;
  let lastError: Error | undefined;
  let currentDelay = intervalMs;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e as Error;

      // 已达最大次数
      if (attempt >= maxAttempts - 1) break;

      // 异常类型过滤
      if (retryableExceptions && retryableExceptions.length > 0) {
        const isRetryable = retryableExceptions.some(type => lastError instanceof type);
        if (!isRetryable) break;
      }

      const delayMs = exponential ? currentDelay : intervalMs;
      onRetry?.(attempt + 1, lastError, delayMs);
      logger.warn(
        `执行失败，第 ${attempt + 1} 次重试（${delayMs}ms 后）：${lastError.message}`,
      );
      await sleep(delayMs);

      if (exponential) currentDelay *= 2;
    }
  }

  throw lastError ?? new Error('Retry failed without error');
}

/**
 * 指数退避版（对应 Java RetryUtils.executeWithExponentialBackoff）
 */
export async function executeWithExponentialBackoff<T>(
  fn: Retryable<T>,
  maxRetries: number,
  baseIntervalMs: number,
  retryableExceptions?: Array<new (...args: never[]) => Error>,
): Promise<T> {
  return execute(fn, {
    maxRetries,
    intervalMs: baseIntervalMs,
    exponential: true,
    retryableExceptions,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}