/**
 * @Author Martin
 * @Date 2026/9/22
 *
 * Grsai nano-banana 客户端
 *
 * 端点：{baseUrl}/v1/api/generate + /v1/api/result
 * 模型：nano-banana / nano-banana-fast / nano-banana-2 / ... / nano-banana-pro-4k-vip
 *
 * 提交后自动以 replyType=async 拿到 taskId，并通过 GrsaiTaskRunner 阻塞轮询。
 */

import type {
  BananaClientOptions,
  BananaGenerateRequest,
  BananaModel,
  BananaTaskResult,
  GenerateRequest,
  GenerateResult,
  GeneratedImage,
  BackendId,
} from '../types/index.js';
import { BaseImageClient } from './base.js';
import { GrsaiTaskRunner } from './grsai-runner.js';

export class BananaClient extends BaseImageClient {
  override readonly id: BackendId = 'banana';
  override readonly displayName: string = 'nano-banana (grsai)';

  private runner: GrsaiTaskRunner;

  /** 直接查询任务状态（用于 web 端轮询） */
  async fetchTask(taskId: string): Promise<BananaTaskResult> {
    return this.runner.fetchTask(taskId);
  }

  constructor(options: BananaClientOptions) {
    super({
      id: 'banana',
      displayName: 'nano-banana (grsai)',
      apiKey: options.apiKey,
      proxy: options.proxy,
      timeoutMs: options.timeoutMs,
      onTick: options.onTick,
    });
    this.runner = new GrsaiTaskRunner({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
      proxy: options.proxy,
      timeoutMs: options.timeoutMs,
      pollIntervalsSeconds: options.pollIntervalsSeconds,
      maxWaitSeconds: options.maxWaitSeconds,
      label: 'banana',
    });
  }

  /**
   * 走 BaseImageClient 通用入口（extras 透传模型与比例/分辨率字段）
   */
  protected override async doGenerate(
    req: GenerateRequest,
  ): Promise<Omit<GenerateResult, 'backend' | 'durationMs'>> {
    const bananaReq: BananaGenerateRequest = {
      prompt: req.prompt,
      images: req.inputImages,
      model: req.extras?.model as BananaModel | undefined,
      aspectRatio: req.extras?.aspectRatio as BananaGenerateRequest['aspectRatio'],
      imageSize: req.extras?.imageSize as BananaGenerateRequest['imageSize'],
      replyType: 'async',
    };
    const task = await this.runTask(bananaReq);
    return {
      images: (task.results ?? []).map<GeneratedImage>(r => ({ url: r.url })),
    };
  }

  /**
   * 直接执行 banana 任务（命令层调用）
   */
  async runTask(req: BananaGenerateRequest): Promise<BananaTaskResult> {
    const payload = this.buildPayload(req);
    return this.runner.run({ payload });
  }

  /** 暴露 taskId 提交能力，便于上层重试 */
  async submit(req: BananaGenerateRequest): Promise<string> {
    return this.runner.submit({ payload: this.buildPayload(req) });
  }

  private buildPayload(req: BananaGenerateRequest): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      model: req.model ?? 'nano-banana-2',
      prompt: req.prompt,
      replyType: 'async',
    };
    if (req.images && req.images.length > 0) payload.images = req.images;
    if (req.aspectRatio) payload.aspectRatio = req.aspectRatio;
    if (req.imageSize) payload.imageSize = req.imageSize;
    return payload;
  }
}