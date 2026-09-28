/**
 * @Author Martin
 * @Date 2026/9/22
 *
 * Grsai minimax-h3 视频生成客户端
 *
 * 注意：虽然本类继承自 BaseImageClient（图片基类），
 * 但它实际生成的是视频文件（.mp4），返回的 GeneratedImage.url
 * 也是视频 URL；下载时由 inferExt 推断为 .mp4。
 *
 * 端点：{baseUrl}/v1/api/generate + /v1/api/result
 * 必填参数：prompt / aspectRatio(portrait|landscape) /
 *           resolution(480p|768p|1080p) / duration(1~15，1080p≤10)
 * 可选参数：images(≤9)、audios(≤3)、seed
 */

import type {
  GenerateRequest,
  GenerateResult,
  GeneratedImage,
  MinimaxH3ClientOptions,
  MinimaxH3GenerateRequest,
  BananaTaskResult,
  BackendId,
} from '../types/index.js';
import { BaseImageClient } from './base.js';
import { GrsaiTaskRunner } from './grsai-runner.js';

export class MinimaxH3Client extends BaseImageClient {
  override readonly id: BackendId = 'minimax-h3';
  override readonly displayName: string = 'minimax-h3 视频 (grsai)';

  private runner: GrsaiTaskRunner;

  /** 直接查询任务状态（用于 web 端轮询） */
  async fetchTask(taskId: string): Promise<BananaTaskResult> {
    return this.runner.fetchTask(taskId);
  }

  constructor(options: MinimaxH3ClientOptions) {
    super({
      id: 'minimax-h3',
      displayName: 'minimax-h3 视频 (grsai)',
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
      label: 'minimax-h3',
    });
  }

  /**
   * BaseImageClient 通用入口（extras 透传）
   * 注意：调用方需在 extras 里给出 aspectRatio / resolution / duration
   */
  protected override async doGenerate(
    req: GenerateRequest,
  ): Promise<Omit<GenerateResult, 'backend' | 'durationMs'>> {
    const videoReq: MinimaxH3GenerateRequest = {
      prompt: req.prompt,
      images: req.inputImages,
      aspectRatio: req.extras?.aspectRatio as MinimaxH3GenerateRequest['aspectRatio'],
      resolution: req.extras?.resolution as MinimaxH3GenerateRequest['resolution'],
      duration: req.extras?.duration as number,
      audios: req.extras?.audios as string[] | undefined,
      seed: req.extras?.seed as number | undefined,
      replyType: 'async',
    };
    const task = await this.runVideo(videoReq);
    return {
      images: (task.results ?? []).map<GeneratedImage>(r => ({
        url: r.url,
        mimeType: 'video/mp4',
      })),
    };
  }

  /**
   * 直接执行视频生成任务（命令层调用）
   */
  async runVideo(req: MinimaxH3GenerateRequest): Promise<BananaTaskResult> {
    this.validateVideoRequest(req);
    const payload = this.buildPayload(req);
    return this.runner.run({ payload });
  }

  private validateVideoRequest(req: MinimaxH3GenerateRequest): void {
    if (!req.prompt) throw new Error('minimax-h3: prompt 必填');
    if (!req.aspectRatio) throw new Error('minimax-h3: aspectRatio 必填（portrait/landscape）');
    if (!req.resolution) throw new Error('minimax-h3: resolution 必填（480p/768p/1080p）');
    if (!req.duration || req.duration < 1 || req.duration > 15) {
      throw new Error('minimax-h3: duration 必须在 1~15 秒之间');
    }
    if (req.resolution === '1080p' && req.duration > 10) {
      throw new Error('minimax-h3: 1080p 分辨率最多支持 10 秒');
    }
    if (req.images && req.images.length > 9) {
      throw new Error('minimax-h3: 最多支持 9 张参考图');
    }
    if (req.audios && req.audios.length > 3) {
      throw new Error('minimax-h3: 最多支持 3 个参考音频');
    }
  }

  private buildPayload(req: MinimaxH3GenerateRequest): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      model: 'minimax-h3',
      prompt: req.prompt,
      aspectRatio: req.aspectRatio,
      resolution: req.resolution,
      duration: req.duration,
      replyType: 'async',
    };
    if (req.images && req.images.length > 0) payload.images = req.images;
    if (req.audios && req.audios.length > 0) payload.audios = req.audios;
    if (req.seed !== undefined) payload.seed = req.seed;
    return payload;
  }
}