/**
 * @Author Martin
 * @Date 2026/9/22
 *
 * CLI 日志工具（基于 picocolors，避免 chalk 体积过大的问题）
 *
 * --json 模式下：
 *   - 所有人类可读日志走 stderr（不污染 stdout 上的 JSON 结果）
 *   - emitOk / emitError 单独走 stdout（结构化结果）
 */

import pc from 'picocolors';

const isVerbose = process.env.AI_PAINT_VERBOSE === '1' || process.env.DEBUG === '1';

let jsonMode = false;

/**
 * 设置 --json 模式：之后所有 logger.* 输出走 stderr，让 stdout 干净地承载 JSON
 */
export function setJsonMode(enabled: boolean): void {
  jsonMode = !!enabled;
}

/** 把 stdout 写一行（json 模式关闭时 = console.log；否则强制 stderr 写） */
function out(line: string): void {
  if (jsonMode) {
    process.stderr.write(line + '\n');
  } else {
    console.log(line);
  }
}

/** 把 stderr 写一行（不受 jsonMode 影响，永远走 stderr） */
function err(line: string): void {
  process.stderr.write(line + '\n');
}

/**
 * 输出 info 级别日志（蓝色图标）
 */
export function info(message: string, ...args: unknown[]): void {
  out(`${pc.blue('ℹ')} ${message}${args.length ? ' ' + args.join(' ') : ''}`);
}

/**
 * 输出成功日志（绿色对勾）
 */
export function success(message: string, ...args: unknown[]): void {
  out(`${pc.green('✔')} ${message}${args.length ? ' ' + args.join(' ') : ''}`);
}

/**
 * 输出警告（黄色三角）
 */
export function warn(message: string, ...args: unknown[]): void {
  err(`${pc.yellow('⚠')} ${message}${args.length ? ' ' + args.join(' ') : ''}`);
}

/**
 * 输出错误（红色叉号）
 */
export function error(message: string, ...args: unknown[]): void {
  err(`${pc.red('✖')} ${message}${args.length ? ' ' + args.join(' ') : ''}`);
}

/**
 * 输出调试信息（仅在 verbose 模式下）
 */
export function debug(message: string, ...args: unknown[]): void {
  if (isVerbose) {
    out(`${pc.gray('·')} ${pc.gray(message)}${args.length ? ' ' + args.join(' ') : ''}`);
  }
}

/**
 * 输出关键步骤（青色箭头）
 */
export function step(message: string, ...args: unknown[]): void {
  out(`${pc.cyan('➜')} ${message}${args.length ? ' ' + args.join(' ') : ''}`);
}

/**
 * 输出一段高亮的标题（不加 bold，避免中文 wide-char 间距错位）
 */
export function heading(message: string): void {
  out(pc.cyan(message));
}

/**
 * 打印键值对齐的两列（key 青色，value 默认色）
 */
export function kv(key: string, value: string, keyWidth = 14): void {
  out(`  ${pc.cyan(key.padEnd(keyWidth))}  ${value}`);
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
    out(`  ${pc.green('✔')} ${filePath}  ${pc.dim(`(${fmtDuration(durationMs)})`)}`);
  } else {
    out(`  ${pc.green('✔')} ${filePath}`);
  }
}

/**
 * 普通日志（无图标）
 */
export function log(message: string, ...args: unknown[]): void {
  out(`${message}${args.length ? ' ' + args.join(' ') : ''}`);
}

/**
 * 走 stderr 的信息日志（不会被 ora spinner 覆盖）
 * 用于轮询心跳等长时间运行的进度提示
 */
export function tick(message: string): void {
  err(`  ${pc.cyan('ℹ')} ${message}`);
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
  tick,
  colors: pc,
  setJsonMode,
};

export default logger;