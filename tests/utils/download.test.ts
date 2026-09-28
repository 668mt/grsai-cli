/**
 * @Author Martin
 * @Date 2026/9/22
 *
 * download 工具测试
 */

import { describe, expect, it } from 'vitest';
import { formatOutput, inferExt, looksLikeFile } from '@utils/download';

describe('inferExt', () => {
  it('从 URL 路径推断 png', () => {
    expect(inferExt('https://example.com/foo/bar.png')).toBe('.png');
  });

  it('从 URL 路径推断 jpg', () => {
    expect(inferExt('https://example.com/foo/bar.JPG')).toBe('.jpg');
  });

  it('忽略 query string', () => {
    expect(inferExt('https://example.com/foo/bar.webp?v=1')).toBe('.webp');
  });

  it('从 content-type 推断', () => {
    expect(inferExt('https://example.com/foo', 'image/png')).toBe('.png');
    expect(inferExt('https://example.com/foo', 'image/jpeg')).toBe('.jpg');
    expect(inferExt('https://example.com/foo', 'image/webp')).toBe('.webp');
  });

  it('未知时默认 bin', () => {
    expect(inferExt('https://example.com/foo')).toBe('.bin');
  });

  it('非图片扩展名时回退到 content-type', () => {
    expect(inferExt('https://example.com/foo.bin', 'image/gif')).toBe('.gif');
  });

  it('推断 mp4 视频扩展名', () => {
    expect(inferExt('https://example.com/foo.mp4', 'video/mp4')).toBe('.mp4');
  });
});

describe('looksLikeFile', () => {
  it('带扩展名视为文件', () => {
    expect(looksLikeFile('a.png')).toBe(true);
    expect(looksLikeFile('D:/test/out.jpg')).toBe(true);
  });

  it('不带扩展名视为目录', () => {
    expect(looksLikeFile('D:/test/out')).toBe(false);
    expect(looksLikeFile('output')).toBe(false);
  });
});

describe('formatOutput', () => {
  it('文件 + 无 seq：返回原路径', () => {
    const r = formatOutput('D:/test/out.png', 'png');
    expect(r.endsWith('out.png')).toBe(true);
  });

  it('文件 + 有 seq：在文件名后加 -seq', () => {
    const r = formatOutput('D:/test/out.png', 'png', 2);
    expect(r.endsWith('out-2.png')).toBe(true);
  });

  it('目录 + 有 seq：生成 <uuid>-seq.png', () => {
    const r = formatOutput('D:/test/out', 'png', 1);
    expect(r).toMatch(/-1\.png$/);
    expect(r).toContain('out');
  });

  it('目录 + 无 seq：生成 <uuid>.png', () => {
    const r = formatOutput('D:/test/out', 'png');
    expect(r).toMatch(/\.png$/);
    expect(r).toContain('out');
  });

  it('目录 + 有 seq：生成 <uuid>-seq.png', () => {
    const r = formatOutput('D:/test/out', 'png', 3);
    expect(r).toMatch(/-3\.png$/);
  });

  it('扩展名前缀 . 会被去掉', () => {
    const r = formatOutput('D:/test/', '.png');
    expect(r).toMatch(/\.png$/);
  });
});