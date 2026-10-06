/**
 * @Author Martin
 * @Date 2026/9/22
 *
 * Grsai gpt-image-2 / gpt-image-2.5 客户端
 *
 * 端点：{baseUrl}/v1/api/generate + /v1/api/result
 * 模型：gpt-image-2 / gpt-image-2-vip / gpt-image-2.5 /
 *       gpt-image-2.5-flare / gpt-image-2.5-sunburst
 *
 * 提交后自动以 replyType=async 拿到 taskId，并通过 GrsaiTaskRunner 阻塞轮询。
 */

import type {
  GenerateRequest,
  GenerateResult,
  GeneratedImage,
  GptImageClientOptions,
  GptImageGenerateRequest,
  GptImageModel,
  BananaTaskResult,
  BackendId,
} from '../types/index.js';
import { BaseImageClient } from './base.js';
import { GrsaiTaskRunner } from './grsai-runner.js';

export class GptImageClient extends BaseImageClient {
  override readonly id: BackendId = 'gpt-image';
  override readonly displayName: string = 'gpt-image-2 / 2.5 (grsai)';

  private runner: GrsaiTaskRunner;

  /** 直接查询任务状态（用于 web 端轮询） */
  async fetchTask(taskId: string): Promise<BananaTaskResult> {
    return this.runner.fetchTask(taskId);
  }

  constructor(options: GptImageClientOptions) {
    super({
      id: 'gpt-image',
      displayName: 'gpt-image-2 / 2.5 (grsai)',
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
      label: options.label ?? 'gpt',
    });
  }

  /**
   * BaseImageClient 通用入口（extras 透传）
   */
  protected override async doGenerate(
    req: GenerateRequest,
  ): Promise<Omit<GenerateResult, 'backend' | 'durationMs'>> {
    const gptReq: GptImageGenerateRequest = {
      prompt: req.prompt,
      images: req.inputImages,
      model: req.extras?.model as GptImageModel | undefined,
      aspectRatio: req.extras?.aspectRatio as GptImageGenerateRequest['aspectRatio'],
      quality: req.extras?.quality as GptImageGenerateRequest['quality'],
      background: req.extras?.background as GptImageGenerateRequest['background'],
      mask: req.extras?.mask as GptImageGenerateRequest['mask'],
      replyType: 'async',
    };
    const task = await this.runTask(gptReq);
    return {
      images: (task.results ?? []).map<GeneratedImage>(r => ({ url: r.url })),
    };
  }

  /**
   * 直接执行 gpt-image 任务（命令层调用）
   */
  async runTask(req: GptImageGenerateRequest): Promise<BananaTaskResult> {
    const payload = this.buildPayload(req);
    return this.runner.run({ payload });
  }

  private buildPayload(req: GptImageGenerateRequest): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      model: req.model ?? 'gpt-image-2.5',
      prompt: req.prompt,
      replyType: 'async',
    };
    if (req.images && req.images.length > 0) payload.images = req.images;
    if (req.aspectRatio) payload.aspectRatio = req.aspectRatio;
    if (req.quality) payload.quality = req.quality;
    if (req.background) payload.background = req.background;
    if (req.mask) payload.mask = req.mask;
    if (req.seed !== undefined && req.seed > 0) payload.seed = req.seed;
    return payload;
  }
}