/**
 * @Author Martin
 * @Date 2026/9/22
 *
 * HTTP 工具：基于 ofetch 封装，统一超时/代理/重试
 */

import { ofetch, type FetchOptions, FetchError } from 'ofetch';
import { HttpsProxyAgent } from 'https-proxy-agent';
import logger from './logger.js';

export interface HttpClientOptions {
  /** 代理地址，如 http://127.0.0.1:7890 */
  proxy?: string;
  /** 单次请求超时（毫秒） */
  timeoutMs?: number;
  /** 最大重试次数 */
  retries?: number;
  /** 默认请求头 */
  headers?: Record<string, string>;
}

/**
 * 创建 ofetch 实例，自动应用代理与超时
 */
export function createHttpClient(options: HttpClientOptions = {}) {
  const {
    proxy,
    timeoutMs = 180_000,
    retries = 2,
    headers = {},
  } = options;

  const finalHeaders: Record<string, string> = {
    'User-Agent': 'ai-paint/0.1.0',
    ...headers,
  };

  // 仅在明确提供代理时挂代理
  const fetchOptions: FetchOptions = {
    timeout: timeoutMs,
    retry: retries,
    retryDelay: 1000,
    retryStatusCodes: [408, 429, 500, 502, 503, 504],
    headers: finalHeaders,
  };

  if (proxy) {
    try {
      // 动态 import，依赖未安装也不影响主流程
      const agent = new HttpsProxyAgent(proxy);
      fetchOptions.agent = agent as unknown as FetchOptions['agent'];
    } catch (e) {
      logger.warn(`代理配置失败，将忽略代理: ${(e as Error).message}`);
    }
  }

  return ofetch.create(fetchOptions);
}

/**
 * 统一处理 HTTP 异常，转换为带上下文的错误信息
 */
export function wrapError(e: unknown, context: string): Error {
  if (e instanceof FetchError) {
    const status = e.response?.status ?? 'unknown';
    const body = typeof e.data === 'string' ? e.data : JSON.stringify(e.data ?? {});
    return new Error(`${context} 失败 [HTTP ${status}]: ${e.message}\n${body}`);
  }
  if (e instanceof Error) {
    return new Error(`${context} 失败: ${e.message}`);
  }
  return new Error(`${context} 失败: ${String(e)}`);
}