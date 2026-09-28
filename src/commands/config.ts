/**
 * @Author Martin
 * @Date 2026/9/22
 *
 * config 命令：管理持久化配置
 *
 * 用法：
 *   grsai config set --api-key sk-xxx       # 设置 API Key
 *   grsai config set --output-dir ./out     # 设置输出目录
 *   grsai config set --proxy http://...     # 设置 HTTP 代理
 *   grsai config get                        # 查看当前配置（Key 已脱敏，JSON）
 *   grsai config list                       # 人眼友好的配置总览
 *   grsai config path                       # 配置文件路径
 */

import {
  CONFIG_PATHS,
  loadConfig,
  maskConfig,
  updateConfig,
} from '../utils/config.js';
import { logger } from '../utils/logger.js';

export interface ConfigSetOptions {
  apiKey?: string;
  outputDir?: string;
  proxy?: string;
  /** LLM 配置（用于提示词优化） */
  llmApiKey?: string;
  llmBaseUrl?: string;
  llmModel?: string;
}

export interface ConfigAction {
  action: 'get' | 'set' | 'list' | 'path';
  set?: ConfigSetOptions;
}

/**
 * 入口
 */
export async function runConfig(action: ConfigAction): Promise<void> {
  switch (action.action) {
    case 'get':
      return showCurrent();
    case 'set':
      return applyUpdate(action.set!);
    case 'list':
      return showList();
    case 'path':
      return showPath();
  }
}

async function showCurrent(): Promise<void> {
  const cfg = await loadConfig();
  logger.heading('当前配置');
  console.log(JSON.stringify(maskConfig(cfg), null, 2));
}

async function showList(): Promise<void> {
  const cfg = await loadConfig();
  const hasKey = Boolean(cfg.apiKey?.trim());
  const hasLlm = Boolean(cfg.llmApiKey?.trim());

  logger.heading('API Key');
  console.log(
    `  ${
      hasKey
        ? logger.colors.green('✔ grsai API Key 已配置')
        : logger.colors.yellow('⚠ grsai API Key 未配置（运行 config set --api-key <KEY>）')
    }`,
  );
  console.log(
    `  ${
      hasLlm
        ? logger.colors.green('✔ LLM 已配置（agent 优化启用）')
        : logger.colors.dim('· LLM 未配置（agent 优化未启用）')
    }`,
  );

  logger.heading('全局选项');
  console.log(
    `  ${logger.colors.cyan('outputDir'.padEnd(14))}  ${
      cfg.outputDir ?? logger.colors.dim('(未设置，默认当前路径)')
    }`,
  );
  console.log(`  ${logger.colors.cyan('timeout'.padEnd(14))}  ${Math.round(cfg.timeoutMs / 1000)}s`);
  console.log(
    `  ${logger.colors.cyan('proxy'.padEnd(14))}  ${
      cfg.proxy ? cfg.proxy : logger.colors.dim('(未设置)')
    }`,
  );

  console.log('');
  logger.log(`配置文件：${logger.colors.cyan(CONFIG_PATHS.file)}`);
}

function showPath(): void {
  logger.log(`配置文件：${logger.colors.cyan(CONFIG_PATHS.file)}`);
}

async function applyUpdate(opts: ConfigSetOptions): Promise<void> {
  const patch: Parameters<typeof updateConfig>[0] = {};

  if (opts.apiKey !== undefined) patch.apiKey = opts.apiKey;
  if (opts.outputDir) patch.outputDir = opts.outputDir;
  if (opts.proxy !== undefined) patch.proxy = opts.proxy;
  if (opts.llmApiKey !== undefined) patch.llmApiKey = opts.llmApiKey;
  if (opts.llmBaseUrl !== undefined) patch.llmBaseUrl = opts.llmBaseUrl;
  if (opts.llmModel !== undefined) patch.llmModel = opts.llmModel;

  if (Object.keys(patch).length === 0) {
    throw new Error(
      'config set 至少需要一个选项：\n'
      + '  --api-key <KEY>       设置 grsai API Key\n'
      + '  --output-dir <path>   设置输出目录\n'
      + '  --proxy <url>         设置 HTTP 代理\n'
      + '  --llm-api-key <KEY>   设置 LLM API Key（用于 agent）\n'
      + '  --llm-base-url <url>  设置 LLM Base URL\n'
      + '  --llm-model <model>   设置 LLM 模型',
    );
  }

  const next = await updateConfig(patch);
  logger.success('配置已更新');
  console.log(JSON.stringify(maskConfig(next), null, 2));
}