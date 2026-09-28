/**
 * @Author Martin
 * @Date 2026/9/22
 *
 * config 工具测试
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveApiKey } from '@utils/config';

const baseConfig = { outputDir: './out', timeoutMs: 180_000 } as any;

describe('resolveApiKey', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('优先返回 CLI key', () => {
    expect(resolveApiKey({ ...baseConfig, apiKey: 'cfg' }, 'cli')).toBe('cli');
  });

  it('CLI key 为空字符串时回退到配置', () => {
    expect(resolveApiKey({ ...baseConfig, apiKey: 'cfg' }, '   ')).toBe('cfg');
  });

  it('CLI 没传时返回配置中的 key', () => {
    expect(resolveApiKey({ ...baseConfig, apiKey: 'cfg' })).toBe('cfg');
  });

  it('配置为空时回退到 GRSAI_API_KEY 环境变量', () => {
    vi.stubEnv('GRSAI_API_KEY', 'env-grsai');
    expect(resolveApiKey({ ...baseConfig })).toBe('env-grsai');
  });

  it('GRSAI_API_KEY 未设置时回退到 AI_PAINT_API_KEY（兼容旧名）', () => {
    vi.stubEnv('AI_PAINT_API_KEY', 'legacy');
    expect(resolveApiKey({ ...baseConfig })).toBe('legacy');
  });

  it('都没有则返回 undefined', () => {
    expect(resolveApiKey({ ...baseConfig })).toBeUndefined();
  });
});