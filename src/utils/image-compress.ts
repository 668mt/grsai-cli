/**
 * @Author Martin
 * @Date 2026/10/7
 *
 * 图片压缩工具（用于本地参考图，grsai 平台有限制）
 *
 * 行为：
 *   - 默认开启自动压缩
 *   - 文件 > 5MB 时触发压缩
 *   - 压缩目标：< 2MB（保持基本画质）
 *   - 输出格式：JPEG（80+ 质量，体积小）
 *
 * 策略：
 *   1. 尝试保留原格式（PNG / JPEG / WebP），逐步降低质量
 *   2. 仍 > 2MB 时缩小尺寸（最长边 1920 / 1280 / 1024）
 *   3. 仍 > 2MB 时降质量到 70
 *   4. 仍 > 2MB 时强制 JPEG 重新编码
 *   5. 还 > 2MB 时放弃（极罕见超大图）
 */
import { stat } from 'node:fs/promises';
import { extname } from 'node:path';
import sharp from 'sharp';
// sharp 是 ESM-only，不直接导出 namespace；用 ReturnType 拿 pipeline 类型
type SharpPipeline = ReturnType<typeof sharp>;

import { logger } from './logger.js';

/** 触发压缩的文件大小阈值（字节，5MB） */
export const COMPRESS_THRESHOLD_BYTES = 5 * 1024 * 1024;

/** 压缩目标最大字节数（2MB） */
export const COMPRESS_TARGET_BYTES = 2 * 1024 * 1024;

export interface CompressOptions {
  /** 文件大小超过此值才压缩（默认 5MB） */
  threshold?: number;
  /** 压缩目标上限（默认 2MB） */
  target?: number;
  /** 禁用压缩（直接返回原文件 base64） */
  disabled?: boolean;
}

export interface CompressedBuffer {
  buffer: Buffer;
  mime: string;
  /** 压缩前大小（字节） */
  originalBytes: number;
  /** 压缩后大小（字节） */
  compressedBytes: number;
  /** 是否经过压缩（false 表示原尺寸够小未压缩） */
  compressed: boolean;
}

/**
 * 检测本地图片文件，必要时压缩，返回图片 buffer + mime
 */
export async function readAndMaybeCompressImage(
  filePath: string,
  options: CompressOptions = {},
): Promise<CompressedBuffer> {
  const { threshold = COMPRESS_THRESHOLD_BYTES, target = COMPRESS_TARGET_BYTES, disabled = false } = options;

  const abs = filePath;
  const statInfo = await stat(abs);
  const originalBytes = statInfo.size;
  const ext = extname(abs).toLowerCase();

  // 未超过阈值或禁用压缩：直接读文件返回
  if (disabled || originalBytes <= threshold) {
    const { readFile } = await import('node:fs/promises');
    return {
      buffer: await readFile(abs),
      mime: guessMime(ext),
      originalBytes,
      compressedBytes: originalBytes,
      compressed: false,
    };
  }

  // 超过阈值，开始压缩
  logger.info(`[grsai] 检测到大图 ${(originalBytes / 1024 / 1024).toFixed(2)}MB，开始压缩（目标 < ${(target / 1024 / 1024).toFixed(1)}MB）`);

  const result = await compressImage(abs, ext, target);
  const ratio = ((originalBytes - result.buffer.length) / originalBytes * 100).toFixed(1);
  logger.info(
    `[grsai] 压缩完成：${(originalBytes / 1024 / 1024).toFixed(2)}MB → ${(result.buffer.length / 1024 / 1024).toFixed(2)}MB（节省 ${ratio}%）`,
  );

  return {
    buffer: result.buffer,
    mime: result.mime,
    originalBytes,
    compressedBytes: result.buffer.length,
    compressed: true,
  };
}

/** 根据扩展名猜 MIME */
function guessMime(ext: string): string {
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
  };
  return map[ext] ?? 'image/png';
}

/**
 * 内部压缩：多策略级联
 *
 * 1. 保留格式 → 降质量（PNG 80 → 60；JPEG 85 → 75）
 * 2. 缩小尺寸（最长边 1920 → 1280 → 1024）
 * 3. 降质量到 70
 * 4. 强制 JPEG 重新编码
 */
async function compressImage(
  filePath: string,
  ext: string,
  target: number,
): Promise<{ buffer: Buffer; mime: string }> {
  const img = sharp(filePath);
  const meta = await img.metadata();

  // 策略 1：保留原格式，按质量梯度压缩
  const preserveFormat = ['.png', '.jpg', '.jpeg', '.webp'].includes(ext);
  if (preserveFormat) {
    for (const quality of [85, 75, 65]) {
      const buf = await encodeByFormat(img, ext, quality, meta.width, meta.height);
      if (buf.length <= target) {
        return { buffer: buf, mime: guessMime(ext) };
      }
    }
  }

  // 策略 2：缩小尺寸（保留格式）
  if (preserveFormat) {
    for (const maxDim of [1920, 1280, 1024]) {
      for (const quality of [80, 70]) {
        const buf = await encodeByFormat(img, ext, quality, maxDim, maxDim);
        if (buf.length <= target) {
          return { buffer: buf, mime: guessMime(ext) };
        }
      }
    }
  }

  // 策略 3：强制 JPEG（重新编码，最压缩）
  for (const maxDim of [1920, 1280]) {
    for (const quality of [80, 70, 60]) {
      const buf = await img
        .clone()
        .resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();
      if (buf.length <= target) {
        return { buffer: buf, mime: 'image/jpeg' };
      }
    }
  }

  // 实在压不到：返回当前最佳（最后一次压缩）
  logger.warn(`[grsai] 图片压缩到目标 ${(target / 1024 / 1024).toFixed(1)}MB 失败，返回最后结果`);
  const buf = await img
    .clone()
    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 60, mozjpeg: true })
    .toBuffer();
  return { buffer: buf, mime: 'image/jpeg' };
}

/** 按扩展名编码（保持格式） */
async function encodeByFormat(
  img: SharpPipeline,
  ext: string,
  quality: number,
  maxWidth?: number,
  maxHeight?: number,
): Promise<Buffer> {
  let pipeline = img.clone();

  // 缩小尺寸（如果有 maxWidth/maxHeight）
  if (maxWidth && maxHeight) {
    pipeline = pipeline.resize(maxWidth, maxHeight, {
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  switch (ext) {
    case '.png':
      return await pipeline
        .png({
          compressionLevel: quality >= 80 ? 9 : quality >= 70 ? 8 : 6,
          palette: quality < 80, // 低质量用调色板
        })
        .toBuffer();
    case '.jpg':
    case '.jpeg':
      return await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
    case '.webp':
      return await pipeline.webp({ quality }).toBuffer();
    default:
      // 不支持的格式，强制 JPEG
      return await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
  }
}