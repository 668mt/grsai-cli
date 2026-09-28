/**
 * @Author Martin
 * @Date 2026/9/28
 *
 * grsai install 命令：把内置的 skill 安装到全局目录 ~/.agents/skills/
 *
 * 用法：
 *   grsai install                # 安装所有内置 skill
 *   grsai install grsai          # 只安装指定 skill
 *   grsai install --list         # 列出可用 skill
 *   grsai install --force        # 覆盖已存在的 skill
 *   grsai install --target <dir> # 自定义目标目录（默认 ~/.agents/skills/）
 */

import { existsSync } from 'node:fs';
import { mkdir, cp, readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { logger } from '../utils/logger.js';

const DEFAULT_TARGET = join(homedir(), '.agents', 'skills');

/** 内置 skill 目录（相对项目根） */
const BUILTIN_SKILLS_DIR = resolve(process.cwd(), 'skills');

/** 把 `~` 或 `~/foo` 展开为 home 目录（Node path 不自动展开） */
function expandHome(p: string): string {
  if (p === '~') return homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) {
    return join(homedir(), p.slice(2));
  }
  return p;
}

export interface InstallCommandOptions {
  /** 指定要安装的 skill 名称（可重复；不传则安装全部） */
  skills?: string[];
  /** 目标目录，默认 ~/.agents/skills/ */
  target?: string;
  /** 覆盖已存在的目录 */
  force?: boolean;
  /** 只列出可用 skill 不安装 */
  list?: boolean;
  /** dry run，只显示会做什么 */
  dryRun?: boolean;
}

interface SkillInfo {
  name: string;
  sourceDir: string;
  description?: string;
}

export async function runInstall(opts: InstallCommandOptions): Promise<void> {
  const target = opts.target ? resolve(expandHome(opts.target)) : DEFAULT_TARGET;

  // 列出可用 skill
  const available = await listAvailableSkills();
  if (available.length === 0) {
    logger.warn(`未找到内置 skill（目录: ${BUILTIN_SKILLS_DIR}）`);
    return;
  }

  if (opts.list) {
    logger.heading('可用 skill');
    for (const s of available) {
      logger.log(`  - ${logger.colors.cyan(s.name)}  ${s.description ?? ''}`);
    }
    logger.log('');
    logger.log(`目标目录：${logger.colors.cyan(target)}`);
    return;
  }

  // 确定要安装的 skill
  const toInstall = opts.skills && opts.skills.length > 0
    ? available.filter(s => opts.skills!.includes(s.name))
    : available;

  if (toInstall.length === 0) {
    logger.warn(`未找到匹配的 skill：${(opts.skills ?? []).join(', ')}`);
    logger.info(`可用 skill：${available.map(s => s.name).join(', ')}`);
    return;
  }

  logger.heading('安装 skill');
  logger.log(`目标：${logger.colors.cyan(target)}`);
  logger.log(`数量：${toInstall.length}`);
  logger.log('');

  if (opts.dryRun) {
    for (const s of toInstall) {
      logger.log(`  [DRY] ${s.name} → ${join(target, s.name)}`);
    }
    return;
  }

  // 创建目标根目录
  await mkdir(target, { recursive: true });

  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;

  for (const s of toInstall) {
    const dest = join(target, s.name);
    const exists = existsSync(dest);

    if (exists && !opts.force) {
      logger.warn(`  ⏭  跳过 ${s.name}（已存在；用 --force 覆盖）`);
      skipCount++;
      continue;
    }

    try {
      // 删除已存在的目录（如果强制覆盖）
      if (exists) {
        const { rm } = await import('node:fs/promises');
        await rm(dest, { recursive: true, force: true });
      }
      await cp(s.sourceDir, dest, { recursive: true });
      logger.success(`  ✔ ${s.name} → ${dest}`);
      successCount++;
    } catch (e) {
      logger.error(`  ✖ ${s.name} 失败：${(e as Error).message}`);
      failCount++;
    }
  }

  logger.log('');
  logger.success(`完成：${successCount} 成功 / ${skipCount} 跳过 / ${failCount} 失败`);
}

/**
 * 扫描内置 skill 目录，返回所有 skill 列表
 */
async function listAvailableSkills(): Promise<SkillInfo[]> {
  if (!existsSync(BUILTIN_SKILLS_DIR)) return [];

  const entries = await readdir(BUILTIN_SKILLS_DIR);
  const skills: SkillInfo[] = [];

  for (const entry of entries) {
    const skillDir = join(BUILTIN_SKILLS_DIR, entry);
    const s = await stat(skillDir);
    if (!s.isDirectory()) continue;

    const skillMd = join(skillDir, 'SKILL.md');
    let description: string | undefined;
    if (existsSync(skillMd)) {
      const { readFile } = await import('node:fs/promises');
      const content = await readFile(skillMd, 'utf-8');
      description = extractDescription(content);
    }

    skills.push({ name: entry, sourceDir: skillDir, description });
  }

  return skills;
}

/**
 * 从 SKILL.md 的 YAML frontmatter 提取 description
 */
function extractDescription(content: string): string | undefined {
  const fmMatch = /^---\n([\s\S]*?)\n---/.exec(content);
  if (!fmMatch) return undefined;
  const fm = fmMatch[1];
  if (!fm) return undefined;
  const descMatch = /description:\s*([\s\S]*?)(?=\n[a-z-]+:|$)/i.exec(fm);
  if (!descMatch || !descMatch[1]) return undefined;
  return descMatch[1]
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .join(' ');
}