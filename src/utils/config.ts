/**
 * @Author Martin
 * @Date 2026/9/22
 *
 * 配置文件管理：使用 ~/.ai-paint/config.json 持久化用户配置
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AppConfig } from '../types/index.js';
import logger from './logger.js';

const CONFIG_DIR = join(homedir(), '.grsai');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG: AppConfig = {
  // outputDir 不设置：命令层 fallback 到 process.cwd()
  timeoutMs: 600_000, // 10 分钟
};

/**
 * 读取配置（不存在则返回默认）
 */
export async function loadConfig(): Promise<AppConfig> {
  if (!existsSync(CONFIG_FILE)) {
    return { ...DEFAULT_CONFIG };
  }
  try {
    const raw = await readFile(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
    };
  } catch (e) {
    logger.warn(`配置文件损坏，使用默认配置: ${(e as Error).message}`);
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * 持久化配置
 */
export async function saveConfig(config: AppConfig): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  logger.debug(`配置已写入 ${CONFIG_FILE}`);
}

/**
 * 合并并保存（partial update）
 */
export async function updateConfig(
  patch: Partial<AppConfig>,
): Promise<AppConfig> {
  const current = await loadConfig();
  const next: AppConfig = {
    ...current,
    ...patch,
  };
  await saveConfig(next);
  return next;
}

/**
 * 解析 grsai API Key（优先级：CLI 选项 > 配置 > 环境变量）
 *
 * 环境变量顺序：
 *   1. GRSAI_API_KEY
 *   2. AI_PAINT_API_KEY（旧名兼容）
 */
export function resolveApiKey(
  config: AppConfig,
  cliKey?: string,
): string | undefined {
  if (cliKey && cliKey.trim().length > 0) return cliKey;
  if (config.apiKey && config.apiKey.trim().length > 0) return config.apiKey;
  return process.env.GRSAI_API_KEY ?? process.env.AI_PAINT_API_KEY;
}

/**
 * 打印当前配置（隐藏密钥）
 */
export function maskConfig(config: AppConfig): Record<string, unknown> {
  const mask = (k?: string) =>
    k ? `${k.slice(0, 4)}***${k.slice(-2)}` : '(未设置)';
  return {
    ...config,
    apiKey: mask(config.apiKey),
    llmApiKey: mask(config.llmApiKey),
  };
}

export const CONFIG_PATHS = {
  dir: CONFIG_DIR,
  file: CONFIG_FILE,
};

/** 兼容旧版配置目录（~/.ai-paint/config.json） */
export const LEGACY_CONFIG_FILE = join(homedir(), '.ai-paint', 'config.json');