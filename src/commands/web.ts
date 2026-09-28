/**
 * @Author Martin
 * @Date 2026/9/22
 *
 * grsai web 子命令：启动本地 Web 服务（React + Vite 前端）
 *
 * 用法：
 *   grsai web                              # 默认端口 5173
 *   grsai web --port 3000                 # 指定端口
 *   grsai web --no-open                   # 不自动打开浏览器
 *   grsai web --rebuild                   # 强制重新构建前端
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { logger } from '../utils/logger.js';
import { startWebServer } from '../server/index.js';

const DEFAULT_PORT = 5173;

export interface WebCommandOptions {
  port?: string;
  open?: boolean;
  rebuild?: boolean;
  /** 跳过前端构建检查（用于 dev 模式联调） */
  skipBuild?: boolean;
}

export async function runWeb(opts: WebCommandOptions): Promise<void> {
  const port = opts.port ? Number(opts.port) : DEFAULT_PORT;
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error(`非法端口：${opts.port}`);
  }

  // 检查 / 构建前端
  const webDist = resolve(process.cwd(), 'web/dist');
  if (opts.rebuild || !existsSync(webDist)) {
    await buildFrontend();
  } else {
    logger.debug(`web/dist 已存在，跳过构建（加 --rebuild 强制重建）`);
  }

  // 启动后端 + serve 前端
  const server = await startWebServer({
    port,
    open: opts.open !== false,
  });

  // 优雅退出
  const shutdown = () => {
    logger.info('正在关闭 grsai web ...');
    server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

/**
 * 构建 web 前端
 */
async function buildFrontend(): Promise<void> {
  const webDir = resolve(process.cwd(), 'web');
  if (!existsSync(webDir)) {
    throw new Error(
      `web 目录不存在：${webDir}\n` +
        `请确认你在 ai-paint 项目根目录运行命令`,
    );
  }

  logger.info('正在构建 web 前端 (cd web && pnpm install && pnpm build) ...');

  await runCmd('pnpm', ['install', '--silent'], { cwd: webDir });
  await runCmd('pnpm', ['run', 'build'], { cwd: webDir });

  logger.success('web 前端构建完成');
}

function runCmd(cmd: string, args: string[], options: { cwd: string }): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd: options.cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} 退出码 ${code}`));
    });
    proc.on('error', reject);
  });
}