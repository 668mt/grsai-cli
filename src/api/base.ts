/**
 * @Author Martin
 * @Date 2026/9/22
 *
 * 图片生成客户端基类：封装通用流程（校验 / 生成 / 异常转换）
 */

import type {
  GenerateRequest,
  GenerateResult,
  ImageClient,
  BackendId,
} from '../types/index.js';
import { wrapError } from '../utils/http.js';
import { logger } from '../utils/logger.js';

export interface BaseClientOptions {
  id: BackendId;
  displayName: string;
  apiKey: string;
  proxy?: string;
  timeoutMs?: number;
  /** 心跳回调（每 60s 触发一次），用于更新 spinner 等 UI */
  onTick?: (info: { elapsedSeconds: number; progress: number; status: string }) => void;
}

/**
 * 抽象基类：子类只需实现 doGenerate
 */
export abstract class BaseImageClient implements ImageClient {
  abstract readonly id: BackendId;
  abstract readonly displayName: string;

  protected apiKey: string;
  protected proxy?: string;
  protected timeoutMs: number;
  protected onTick?: (info: { elapsedSeconds: number; progress: number; status: string }) => void;

  protected constructor(options: BaseClientOptions) {
    this.apiKey = options.apiKey;
    this.proxy = options.proxy;
    this.timeoutMs = options.timeoutMs ?? 180_000;
    this.onTick = options.onTick;
  }

  /**
   * 校验 API Key（默认实现：检查非空）
   * 子类可重写以做真实连通性测试
   */
  async validate(): Promise<void> {
    if (!this.apiKey || this.apiKey.trim().length === 0) {
      throw new Error(`${this.displayName}: API Key 不能为空`);
    }
  }

  /**
   * 生成图片入口（带计时和异常包装）
   */
  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const started = Date.now();
    try {
      await this.validate();
      logger.debug(`[${this.id}] 发起生成请求: prompt="${req.prompt.slice(0, 60)}..."`);
      const result = await this.doGenerate(req);
      const durationMs = Date.now() - started;
      logger.success(
        `[${this.id}] 生成完成: ${result.images.length} 张, 耗时 ${durationMs}ms`,
      );
      return { ...result, backend: this.id, durationMs };
    } catch (e) {
      throw wrapError(e, `[${this.id}] 生成失败`);
    }
  }

  /**
   * 子类实现真实生成逻辑
   */
  protected abstract doGenerate(req: GenerateRequest): Promise<Omit<GenerateResult, 'backend' | 'durationMs'>>;
}