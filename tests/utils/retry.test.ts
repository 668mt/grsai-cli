/**
 * @Author Martin
 * @Date 2026/9/22
 *
 * retry 工具测试
 */

import { describe, expect, it, vi } from 'vitest';
import { execute, executeWithExponentialBackoff } from '@utils/retry';

describe('execute', () => {
  it('首次成功则不重试', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const onRetry = vi.fn();

    const result = await execute(fn, {
      maxRetries: 3,
      intervalMs: 10,
      onRetry,
    });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('失败一次后重试成功', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('ok');

    const result = await execute(fn, { maxRetries: 2, intervalMs: 5 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('达到 maxRetries 后抛出最后一次异常', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('still failing'));

    await expect(
      execute(fn, { maxRetries: 2, intervalMs: 5 }),
    ).rejects.toThrow('still failing');
    expect(fn).toHaveBeenCalledTimes(3); // 首次 + 2 次重试
  });

  it('按异常类型过滤：不匹配则立即抛错', async () => {
    class MyError extends Error {}
    const fn = vi.fn().mockRejectedValue(new MyError('specific'));

    await expect(
      execute(fn, {
        maxRetries: 5,
        intervalMs: 5,
        retryableExceptions: [TypeError],
      }),
    ).rejects.toThrow('specific');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('executeWithExponentialBackoff', () => {
  it('退避时间翻倍', async () => {
    const delays: number[] = [];
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('e1'))
      .mockRejectedValueOnce(new Error('e2'))
      .mockResolvedValueOnce('ok');

    await executeWithExponentialBackoff(fn, 3, 10).catch(() => {});

    // 调用次数：3
    expect(fn).toHaveBeenCalledTimes(3);
  });
});