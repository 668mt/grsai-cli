/**
 * @Author Martin
 * @Date 2026/9/28
 *
 * 结构化 JSON 输出工具（用于 --json 模式）
 *
 * 设计原则：
 *   - JSON 结果只走 stdout（机器解析用）
 *   - 人类可读的进度日志走 stderr（--json 模式下保持可用，便于调试）
 *   - 成功用 exit 0，失败用 exit 1
 *   - JSON 写在最后一行，方便解析（前面可以有 emoji 风格的进度行）
 *
 * ComfyUI 节点、CI / 脚本、其他 agent 都通过 stdout 解析 JSON。
 */
import process from 'node:process';

/** generate 命令成功结果 */
export interface GenerateOkJson {
  success: true;
  command: string;                // 'banana' | 'gpt' | 'minimax-h3'
  results: Array<{
    path: string;                 // 本地文件绝对路径
    durationMs: number;
  }>;
  totalDurationMs: number;
  count: number;
}

/** generate 命令失败结果 */
export interface GenerateErrorJson {
  success: false;
  command: string;
  error: string;
  errorType?: string;             // 用于节点分流（如 'submit_failed' / 'poll_timeout' / 'http_4xx'）
  results?: Array<{ path: string; durationMs: number }>;  // 部分成功时附带
}

export type GenerateJson = GenerateOkJson | GenerateErrorJson;

/**
 * 写成功 JSON 到 stdout 并退出
 */
export function emitOk(data: Omit<GenerateOkJson, 'success'>): void {
  process.stdout.write(JSON.stringify({ success: true, ...data } satisfies GenerateOkJson) + '\n');
}

/**
 * 写失败 JSON 到 stdout 并退出（exit code = 1）
 */
export function emitError(data: Omit<GenerateErrorJson, 'success'>, exitCode = 1): never {
  process.stdout.write(JSON.stringify({ success: false, ...data } satisfies GenerateErrorJson) + '\n');
  process.exit(exitCode);
}

/**
 * 检测命令是否处于 --json 模式
 */
export function isJsonMode(opts: { json?: boolean }): boolean {
  return !!opts.json;
}