/**
 * @Author Martin
 * @Date 2026/9/23
 *
 * Web 端的本地文件存储：
 *   - 上传文件 → 写到 config.outputDir ?? process.cwd()/output
 *   - 提供 /files/:filename 静态访问
 *   - 生成的图片也保存到这里，结果 URL 改为 /files/xxx.png
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { inferExt } from '../utils/download.js';
import type { AppConfig } from '../types/index.js';

/** web 输出根目录：config.outputDir ?? ./output */
export function getWebOutputDir(config: AppConfig): string {
  return config.outputDir
    ? resolve(config.outputDir)
    : resolve(process.cwd(), 'output');
}

/**
 * 把远程 URL / dataUrl / base64 字符串写入本地文件，返回相对路径（如 `output/xxx.png`）
 *
 * 失败抛 Error，由调用方捕获并降级（保留原 URL）
 */
export async function saveToLocal(
  config: AppConfig,
  source: string,
  extHint?: string,
): Promise<string | null> {
  try {
    const dir = getWebOutputDir(config);
    await mkdir(dir, { recursive: true });

    let buffer: Buffer;
    let ext: string;

    if (source.startsWith('data:')) {
      // base64 data URL
      const m = /^data:([^;]+);base64,(.+)$/.exec(source);
      if (!m) return null;
      buffer = Buffer.from(m[2] ?? '', 'base64');
      const mime = m[1] ?? 'image/png';
      ext = inferExt('', mime);
    } else {
      // 远程 URL：fetch 下来
      const resp = await fetch(source);
      if (!resp.ok) return null;
      buffer = Buffer.from(await resp.arrayBuffer());
      ext = extHint ?? inferExt(source, resp.headers.get('content-type') ?? undefined);
    }

    const filename = `${randomUUID()}${ext}`;
    const filepath = join(dir, filename);
    await writeFile(filepath, buffer);
    return filename;
  } catch {
    return null;
  }
}

/**
 * 把上传的 file（浏览器 File 对象）保存到本地
 */
export async function saveUploadedFile(
  config: AppConfig,
  file: File,
): Promise<{ filename: string; url: string }> {
  const dir = getWebOutputDir(config);
  await mkdir(dir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = extname(file.name) || inferExt('', file.type) || '.bin';
  const filename = `${randomUUID()}${ext}`;
  await writeFile(join(dir, filename), buffer);
  return {
    filename,
    url: `/files/${filename}`,
  };
}

/** 读取 web 输出目录里的文件内容（用于 /files/:filename 路由） */
export async function readWebFile(
  config: AppConfig,
  filename: string,
): Promise<{ buffer: Buffer; mime: string } | null> {
  // 安全检查：禁止路径穿越
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return null;
  }
  const filepath = join(getWebOutputDir(config), filename);
  if (!existsSync(filepath)) return null;

  const buffer = await readFile(filepath);
  const mime = guessMime(filename);
  return { buffer, mime };
}

function guessMime(filename: string): string {
  const ext = extname(filename).toLowerCase();
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
  };
  return map[ext] ?? 'application/octet-stream';
}