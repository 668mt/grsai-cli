#!/usr/bin/env node
/**
 * @Author Martin
 * @Date 2026/9/22
 *
 * grsai CLI 入口
 *
 * 提供以下子命令（按使用频率排序）：
 *   banana          grsai nano-banana 系列生成图片
 *   gpt             grsai gpt-image-2 / 2.5 系列生成图片
 *   minimax-h3      grsai minimax-h3 生成视频
 *   web             启动本地 Web 服务（React + Vite 前端）
 *   config          管理持久化配置（API Key / 输出目录 / 代理）
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command, Option } from 'commander';
import {
  BANANA_ASPECT_RATIOS,
  BANANA_IMAGE_SIZES,
  BANANA_MODELS,
  GPT_IMAGE_BACKGROUNDS,
  GPT_IMAGE_MODELS,
  GPT_IMAGE_QUALITIES,
  MINIMAX_H3_ASPECT_RATIOS,
  MINIMAX_H3_RESOLUTIONS,
} from './types/index.js';
import { runBanana } from './commands/banana.js';
import { runConfig } from './commands/config.js';
import { runGpt } from './commands/gpt.js';
import { runInstall } from './commands/install.js';
import { runMinimaxH3 } from './commands/minimax-h3.js';
import { runWeb } from './commands/web.js';
import { logger, setJsonMode } from './utils/logger.js';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'),
) as { version: string };
const version: string = pkg.version;

const program = new Command();

program
  .name('grsai')
  .description('Grsai AI 图像/视频生成命令行工具 (TypeScript)')
  .version(version);

/* -------------------------------------------------------------------------- */
/* banana (grsai nano-banana)                                                */
/* -------------------------------------------------------------------------- */
program
  .command('banana')
  .description('使用 grsai nano-banana 系列生成图片（自动轮询 + 自动重试 + 并发）')
  .requiredOption('-p, --prompt <text>', '提示词')
  .option('-i, --input <file>', '参考图（URL 或本地路径，可重复 -i 多次；本地路径自动转 base64）', (value, prev: string[] = []) => {
    return [...prev, value];
  }, [])
  .option('-o, --output <path>', '输出路径（文件或目录）')
  .option('-n, --count <n>', '生成数量（1~5），多张时并发跑', '1')
  .option('--overwrite', '覆盖已存在的输出文件', false)
  .addOption(
    new Option('--model <id>', '模型名称')
      .choices(BANANA_MODELS)
      .default('nano-banana-2'),
  )
  .addOption(
    new Option('--ratio <ratio>', '宽高比')
      .choices(BANANA_ASPECT_RATIOS)
      .default('1:1'),
  )
  .addOption(
    new Option('--size <size>', '分辨率')
      .choices(BANANA_IMAGE_SIZES)
      .default('2K'),
  )
  .option('--poll-intervals <list>', '轮询间隔（秒，逗号分隔），默认 5,5,10')
  .option('--max-wait <sec>', '最长等待（秒）', '600')
  .option('-k, --api-key <key>', '临时 API Key')
  .option('--proxy <url>', 'HTTP 代理')
  .option('--retry <n>', '重试次数（默认 2）', '2')
  .option('--json', '输出 JSON 到 stdout（机器可读），进度日志走 stderr')
  .action(async (opts) => {
    try {
      await runBanana(opts);
    } catch (e) {
      if (opts.json) {
        const { emitError } = await import('./utils/json-output.js');
        emitError({
          command: 'banana',
          error: (e as Error).message,
        });
      }
      logger.error((e as Error).message);
      process.exitCode = 1;
    }
  });

/* -------------------------------------------------------------------------- */
/* gpt (grsai gpt-image-2 / 2.5)                                             */
/* -------------------------------------------------------------------------- */
program
  .command('gpt')
  .description('使用 grsai gpt-image-2 / 2.5 系列生成图片（自动轮询 + 自动重试 + 并发）')
  .requiredOption('-p, --prompt <text>', '提示词')
  .option('-i, --input <file>', '参考图（URL 或本地路径，可重复 -i 多次；本地路径自动转 base64）', (value, prev: string[] = []) => {
    return [...prev, value];
  }, [])
  .option('-o, --output <path>', '输出路径（文件或目录）')
  .option('-n, --count <n>', '生成数量（1~5），多张时并发跑', '1')
  .option('--overwrite', '覆盖已存在的输出文件', false)
  .addOption(
    new Option('--model <id>', '模型名称')
      .choices(GPT_IMAGE_MODELS)
      .default('gpt-image-2.5'),
  )
  .option('--ratio <ratio>', '比例（如 1:1）或像素值（如 1024x1024）', '1024x1024')
  .addOption(
    new Option('--quality <quality>', '质量档位')
      .choices(GPT_IMAGE_QUALITIES),
  )
  .addOption(
    new Option('--background <bg>', '背景参数')
      .choices(GPT_IMAGE_BACKGROUNDS),
  )
  .option('--mask <url>', '蒙版图片 URL')
  .option('--poll-intervals <list>', '轮询间隔（秒，逗号分隔），默认 5,5,10')
  .option('--max-wait <sec>', '最长等待（秒）', '600')
  .option('-k, --api-key <key>', '临时 API Key')
  .option('--proxy <url>', 'HTTP 代理')
  .option('--retry <n>', '重试次数（默认 2）', '2')
  .option('--json', '输出 JSON 到 stdout（机器可读），进度日志走 stderr')
  .action(async (opts) => {
    try {
      await runGpt(opts);
    } catch (e) {
      if (opts.json) {
        const { emitError } = await import('./utils/json-output.js');
        emitError({
          command: 'gpt',
          error: (e as Error).message,
        });
      }
      logger.error((e as Error).message);
      process.exitCode = 1;
    }
  });

/* -------------------------------------------------------------------------- */
/* minimax-h3 (grsai 视频)                                                    */
/* -------------------------------------------------------------------------- */
program
  .command('minimax-h3')
  .description('使用 grsai minimax-h3 生成视频（自动轮询 + 自动重试 + 并发；命令名虽叫 paint 实为视频）')
  .alias('mmh3')
  .requiredOption('-p, --prompt <text>', '提示词')
  .addOption(
    new Option('--ratio <ratio>', '画幅方向')
      .choices(MINIMAX_H3_ASPECT_RATIOS)
      .makeOptionMandatory(true),
  )
  .addOption(
    new Option('--resolution <res>', '分辨率')
      .choices(MINIMAX_H3_RESOLUTIONS)
      .makeOptionMandatory(true),
  )
  .addOption(
    new Option('--duration <sec>', '视频时长（1~15 秒，1080p 最多 10 秒）')
      .argParser(Number)
      .makeOptionMandatory(true),
  )
  .option('-i, --input <file>', '参考图（最多 9 张，可重复 -i）', (value, prev: string[] = []) => {
    return [...prev, value];
  }, [])
  .option('--audio <file>', '参考音频（最多 3 个，可重复 --audio）', (value, prev: string[] = []) => {
    return [...prev, value];
  }, [])
  .option('--seed <n>', '随机种子', (v: string) => Number(v))
  .option('-o, --output <path>', '输出路径（文件或目录）')
  .option('-n, --count <n>', '生成数量（1~5），多段时并发跑', '1')
  .option('--overwrite', '覆盖已存在的输出文件', false)
  .option('--poll-intervals <list>', '轮询间隔（秒，逗号分隔），默认 5,5,10')
  .option('--max-wait <sec>', '最长等待（秒）', '900')
  .option('-k, --api-key <key>', '临时 API Key')
  .option('--proxy <url>', 'HTTP 代理')
  .option('--retry <n>', '重试次数（默认 2）', '2')
  .option('--json', '输出 JSON 到 stdout（机器可读），进度日志走 stderr')
  .action(async (opts) => {
    try {
      await runMinimaxH3({
        ...opts,
        duration: String(opts.duration),
      });
    } catch (e) {
      if (opts.json) {
        const { emitError } = await import('./utils/json-output.js');
        emitError({
          command: 'minimax-h3',
          error: (e as Error).message,
        });
      }
      logger.error((e as Error).message);
      process.exitCode = 1;
    }
  });

/* -------------------------------------------------------------------------- */
/* web                                                                        */
/* -------------------------------------------------------------------------- */
program
  .command('web')
  .description('启动本地 Web 服务（React + Vite 前端，自动打开浏览器）')
  .option('-p, --port <port>', '端口号', '5173')
  .option('--no-open', '不自动打开浏览器')
  .option('--rebuild', '强制重新构建前端')
  .action(async (opts) => {
    try {
      await runWeb(opts);
    } catch (e) {
      logger.error((e as Error).message);
      process.exitCode = 1;
    }
  });

/* -------------------------------------------------------------------------- */
/* install（把内置 skill 安装到 ~/.agents/skills/）                           */
/* -------------------------------------------------------------------------- */
program
  .command('install [skills...]')
  .description('安装内置 skill 到 ~/.agents/skills/（默认目录；默认强制覆盖已存在的 skill）')
  .option(
    '-t, --target <dir>',
    '目标目录',
    join(homedir(), '.agents', 'skills'),
  )
  .option(
    '-f, --force',
    '覆盖已存在的 skill（默认开启；用 --no-force 跳过）',
    true,
  )
  .option('--no-force', '不覆盖已存在的 skill（跳过）')
  .option('-l, --list', '列出可用 skill，不安装', false)
  .option('--dry-run', '只显示计划，不实际复制', false)
  .action(async (skills: string[], opts) => {
    try {
      await runInstall({ skills, ...opts });
    } catch (e) {
      logger.error((e as Error).message);
      process.exitCode = 1;
    }
  });

/* -------------------------------------------------------------------------- */
/* config                                                                     */
/* -------------------------------------------------------------------------- */
const configCmd = program
  .command('config')
  .description('管理配置（API Key / 默认 profile / 输出目录）');

configCmd
  .command('get', { isDefault: true })
  .description('查看当前配置（API Key 已脱敏）')
  .action(async () => {
    try {
      await runConfig({ action: 'get' });
    } catch (e) {
      logger.error((e as Error).message);
      process.exitCode = 1;
    }
  });

configCmd
  .command('set')
  .description('更新配置：--api-key / --output-dir / --proxy / --llm-api-key / --llm-base-url / --llm-model')
  .option('--api-key <key>', 'grsai API Key')
  .option('--output-dir <path>', '输出目录')
  .option('--proxy <url>', 'HTTP 代理')
  .option('--llm-api-key <key>', 'LLM API Key（用于 agent 优化提示词；OpenAI 兼容格式）')
  .option('--llm-base-url <url>', 'LLM Base URL（默认 https://api.openai.com/v1）')
  .option('--llm-model <model>', 'LLM 模型（默认 gpt-4o-mini）')
  .action(async (opts) => {
    try {
      await runConfig({
        action: 'set',
        set: {
          apiKey: opts.apiKey,
          outputDir: opts.outputDir,
          proxy: opts.proxy,
          llmApiKey: opts.llmApiKey,
          llmBaseUrl: opts.llmBaseUrl,
          llmModel: opts.llmModel,
        },
      });
    } catch (e) {
      logger.error((e as Error).message);
      process.exitCode = 1;
    }
  });

configCmd
  .command('list')
  .description('列出所有可用 profile')
  .action(async () => {
    try {
      await runConfig({ action: 'list' });
    } catch (e) {
      logger.error((e as Error).message);
      process.exitCode = 1;
    }
  });

configCmd
  .command('path')
  .description('显示配置文件路径')
  .action(async () => {
    try {
      await runConfig({ action: 'path' });
    } catch (e) {
      logger.error((e as Error).message);
      process.exitCode = 1;
    }
  });

/* -------------------------------------------------------------------------- */
/* 解析 + 入口                                                                */
/* -------------------------------------------------------------------------- */
// 命令解析后，根据 opts.json 切换 logger 模式（让 stdout 干净）
program.hook('preAction', (_thisCommand, actionCommand) => {
  const opts = actionCommand.opts<{ json?: boolean }>();
  if (opts && opts.json) {
    setJsonMode(true);
  }
});

program.parseAsync(process.argv).catch((e) => {
  logger.error((e as Error).message ?? String(e));
  process.exitCode = 1;
});