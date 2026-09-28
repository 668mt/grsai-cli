/**
 * @Author Martin
 * @Date 2026/9/22
 *
 * 下载工具 + 文件路径格式化 + 本地图片→base64
 *
 * 与 Java 版行为对齐：
 *   - overwrite=false（默认）时目标文件已存在则抛错
 *   - 原子写入：先写临时文件，再 rename
 *   - formatOutput 命名规则对齐 DownloadUtils.formatOutput
 *   - readLocalImageAsDataUrl 对齐 GrsaiUtils.parseReferenceToUrls 的本地路径分支
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createHttpClient } from './http.js';
import { logger } from './logger.js';

export interface DownloadOptions {
  /** 输出路径（文件或目录） */
  output: string;
  proxy?: string;
  timeoutMs?: number;
  /** 是否覆盖已存在的文件；默认 false（与 Java GrsaiUtils.download 一致） */
  overwrite?: boolean;
  /** 当 output 是目录时使用的文件名前缀 */
  filename?: string;
}

/* -------------------------------------------------------------------------- */
/* 扩展名推断                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * 从 URL / content-type 推断扩展名（图片 + 视频）
 */
export function inferExt(url: string, contentType?: string): string {
  const pathPart = url.split('?')[0] ?? '';
  const ext = extname(pathPart).toLowerCase();
  if (ext && /^\.(png|jpe?g|webp|gif|bmp|svg|mp4|mov|webm|avi|mkv)$/i.test(ext)) {
    return ext;
  }
  if (contentType) {
    const map: Record<string, string> = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'image/bmp': '.bmp',
      'image/svg+xml': '.svg',
      'video/mp4': '.mp4',
      'video/quicktime': '.mov',
      'video/webm': '.webm',
      'video/x-msvideo': '.avi',
      'video/x-matroska': '.mkv',
    };
    const match = map[contentType.toLowerCase()];
    if (match) return match;
  }
  return '.bin';
}

function guessMimeFromExt(ext: string): string {
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
  };
  const normalized = ext.toLowerCase();
  return map[normalized] ?? 'image/png';
}

/* -------------------------------------------------------------------------- */
/* 输出路径格式化（对齐 DownloadUtils.formatOutput）                          */
/* -------------------------------------------------------------------------- */

/**
 * 判断 output 路径是否"看起来像文件"（带图片/视频扩展名）
 *
 * 规则：必须以常见扩展名结尾才算（自动创建父目录）
 *        否则视为目录（用 UUID 生成文件名）
 */
export function looksLikeFile(path: string): boolean {
  return /\.(png|jpe?g|webp|gif|bmp|svg|mp4|mov|webm|avi|mkv)$/i.test(path);
}

/**
 * 生成本地输出路径（对齐 Java DownloadUtils.formatOutput）
 *
 * 规则：
 *   - output 是文件路径（带扩展名）：
 *     - seq 为空 → 返回原路径
 *     - seq 非空 → `<base>-<seq>.<ext>`（保留原扩展名）
 *   - output 是目录：
 *     - seq 为空 → `<uuid>.<ext>`
 *     - seq 非空 → `<uuid>-<seq>.<ext>`
 */
export function formatOutput(output: string, defaultExt: string, seq?: number | null): string {
  const ext = defaultExt.startsWith('.') ? defaultExt.slice(1) : defaultExt;

  if (looksLikeFile(output)) {
    const abs = resolve(output);
    if (seq === undefined || seq === null) {
      return abs;
    }
    const originalExt = extname(abs).slice(1);
    const useExt = originalExt || ext;
    const base = basenameOf(abs).replace(/\.[^.]+$/, '');
    return join(dirnameOf(abs), `${base}-${seq}.${useExt}`);
  }

  const dir = resolve(output);
  const seqPart = seq !== undefined && seq !== null ? `-${seq}` : '';
  return join(dir, `${randomUUID()}${seqPart}.${ext}`);
}

function basenameOf(p: string): string {
  return p.replace(/\\/g, '/').split('/').pop() ?? '';
}

function dirnameOf(p: string): string {
  const normalized = p.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  return idx === -1 ? '.' : normalized.slice(0, idx);
}

/* -------------------------------------------------------------------------- */
/* 下载入口                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * 解析最终落盘路径
 */
async function resolveOutputPath(
  output: string,
  ctx: { filename?: string; isBase64: boolean },
): Promise<string> {
  const abs = resolve(output);
  if (looksLikeFile(abs)) return abs;
  const ext = ctx.isBase64 ? '.png' : '.bin';
  const name = ctx.filename ?? `${Date.now()}${ext}`;
  return join(abs, name);
}

/**
 * 下载远程图片到本地（带原子写 + 已存在检查）
 *
 * - source 支持 data URL（data:image/png;base64,...）
 * - overwrite=false（默认）时若目标已存在则抛错
 */
export async function downloadImage(
  source: string,
  options: DownloadOptions,
): Promise<string> {
  const { output, overwrite = false, filename, proxy, timeoutMs } = options;
  const target = await resolveOutputPath(output, { filename, isBase64: source.startsWith('data:') });

  if (!overwrite && existsSync(target)) {
    throw new Error(`目标文件已存在：${target}（如需覆盖请加 --overwrite）`);
  }

  // 父目录：只创建父目录（不是 target 本身，避免把目标文件路径误建为目录）
  const parentDir = dirnameOf(target);
  await mkdir(parentDir, { recursive: true });

  let buffer: Buffer;
  if (source.startsWith('data:')) {
    buffer = decodeDataUrl(source);
  } else {
    const http = createHttpClient({ proxy, timeoutMs });
    const response = await http.raw(source, { responseType: 'arrayBuffer' });
    buffer = Buffer.from(response._data as ArrayBuffer);
  }

  await atomicWrite(target, buffer, overwrite);
  logger.debug(`已保存 ${source.slice(0, 60)}... → ${target} (${buffer.length} bytes)`);
  return target;
}

function decodeDataUrl(dataUrl: string): Buffer {
  const match = /^data:(.+?);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error(`无效的 data URL: ${dataUrl.slice(0, 64)}...`);
  return Buffer.from(match[2] ?? '', 'base64');
}

/**
 * 原子写入：先写临时文件，再 rename
 * （对应 Java GrsaiUtils.download 的 tempFile + Files.move）
 */
async function atomicWrite(target: string, buffer: Buffer, overwrite: boolean): Promise<void> {
  if (!overwrite && existsSync(target)) {
    throw new Error(`目标文件已存在：${target}`);
  }
  const tmp = `${target}.tmp.${randomUUID()}`;
  try {
    await writeFile(tmp, buffer);
    await rename(tmp, target);
  } catch (e) {
    // 清理临时文件
    try {
      const { unlink } = await import('node:fs/promises');
      await unlink(tmp);
    } catch { /* ignore */ }
    throw e;
  }
}

/**
 * 批量下载（顺序）
 */
export async function downloadImages(
  sources: string[],
  options: DownloadOptions,
): Promise<string[]> {
  const results: string[] = [];
  for (const [index, src] of sources.entries()) {
    const filename = options.filename
      ? `${options.filename}-${index + 1}`
      : `${Date.now()}-${index + 1}${inferExt(src)}`;
    const target = await downloadImage(src, { ...options, filename });
    results.push(target);
  }
  return results;
}

/* -------------------------------------------------------------------------- */
/* 本地图片 → base64（对齐 GrsaiUtils.parseReferenceToUrls 本地路径分支）    */
/* -------------------------------------------------------------------------- */

/**
 * 读取本地图片并返回 base64 data URL
 */
export async function readLocalImageAsDataUrl(filePath: string): Promise<string> {
  const abs = resolve(filePath);
  if (!existsSync(abs)) {
    throw new Error(`本地图片不存在：${abs}`);
  }
  const buffer = await readFile(abs);
  const mime = guessMimeFromExt(extname(abs));
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

/**
 * 把 reference 数组规范化为 URL/base64 数组：
 *   - 以 http(s):// 开头 → 视为 URL 直接保留
 *   - 否则视为本地路径 → 转 base64 data URL
 */
export async function normalizeReferences(inputs: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const input of inputs) {
    if (input.startsWith('http://') || input.startsWith('https://')) {
      out.push(input);
    } else {
      out.push(await readLocalImageAsDataUrl(input));
    }
  }
  return out;
}