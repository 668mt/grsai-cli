/**
 * @Author Martin
 * @Date 2026/9/22
 *
 * CLI 日志工具（基于 picocolors，避免 chalk 体积过大的问题）
 */

import pc from 'picocolors';

const isVerbose = process.env.AI_PAINT_VERBOSE === '1' || process.env.DEBUG === '1';

/**
 * 输出 info 级别日志（蓝色图标）
 */
export function info(message: string, ...args: unknown[]): void {
  console.log(pc.blue('ℹ'), message, ...args);
}

/**
 * 输出成功日志（绿色对勾）
 */
export function success(message: string, ...args: unknown[]): void {
  console.log(pc.green('✔'), message, ...args);
}

/**
 * 输出警告（黄色三角）
 */
export function warn(message: string, ...args: unknown[]): void {
  console.warn(pc.yellow('⚠'), message, ...args);
}

/**
 * 输出错误（红色叉号）
 */
export function error(message: string, ...args: unknown[]): void {
  console.error(pc.red('✖'), message, ...args);
}

/**
 * 输出调试信息（仅在 verbose 模式下）
 */
export function debug(message: string, ...args: unknown[]): void {
  if (isVerbose) {
    console.log(pc.gray('·'), pc.gray(message), ...args);
  }
}

/**
 * 输出关键步骤（青色箭头）
 */
export function step(message: string, ...args: unknown[]): void {
  console.log(pc.cyan('➜'), message, ...args);
}

/**
 * 输出一段高亮的标题（不加 bold，避免中文 wide-char 间距错位）
 */
export function heading(message: string): void {
  console.log(pc.cyan(message));
}

/**
 * 打印键值对齐的两列（key 青色，value 默认色）
 */
export function kv(key: string, value: string, keyWidth = 14): void {
  console.log(`  ${pc.cyan(key.padEnd(keyWidth))}  ${value}`);
}

/**
 * 格式化毫秒为可读时长
 *   1234 -> "1.2s"
 *   61234 -> "1m 1.2s"
 */
export function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = ms - minutes * 60_000;
  return `${minutes}m ${(seconds / 1000).toFixed(1)}s`;
}

/**
 * 任务完成日志：单张耗时 + 路径
 */
export function done(filePath: string, durationMs?: number): void {
  if (durationMs !== undefined) {
    console.log(`  ${pc.green('✔')} ${filePath}  ${pc.dim(`(${fmtDuration(durationMs)})`)}`);
  } else {
    console.log(`  ${pc.green('✔')} ${filePath}`);
  }
}

/**
 * 普通日志（无图标）
 */
export function log(message: string, ...args: unknown[]): void {
  console.log(message, ...args);
}

/**
 * 走 stderr 的信息日志（不会被 ora spinner 覆盖）
 * 用于轮询心跳等长时间运行的进度提示
 */
export function tick(message: string): void {
  process.stderr.write(`  ${pc.cyan('ℹ')} ${message}\n`);
}

export const logger = {
  info,
  success,
  warn,
  error,
  debug,
  step,
  heading,
  log,
  kv,
  fmtDuration,
  done,
  tick: tick,
  colors: pc,
};

export default logger;