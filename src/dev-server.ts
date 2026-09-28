/**
 * @Author Martin
 * @Date 2026/9/23
 *
 * Dev 编排入口：一条 `pnpm dev` 命令同时启动
 *   1) Hono 后端 (含 /api)，端口 5174
 *   2) Vite 前端 dev server (HMR)，端口 5173
 *
 * 浏览器访问 http://localhost:5173
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { startWebServer } from './server/index.js';

const BACKEND_PORT = 5174;
const FRONTEND_PORT = 5173;

async function main() {
  // 1) 启动后端（提供 /api）
  const backend = await startWebServer({
    port: BACKEND_PORT,
    open: false,
  });

  // 2) 启动 Vite 前端 dev server（子进程）
  //    默认不开浏览器（用户已在浏览器里了）
  //    --strictPort 防止端口被占用时自动换
  //    直接调 vite/bin/vite.js（避免 Windows 上 .cmd 的 spawn EINVAL）
  const webDir = resolve(process.cwd(), 'web');
  const viteBin = resolve(webDir, 'node_modules/vite/bin/vite.js');
  const vite: ChildProcess = spawn(
    process.execPath, // node 可执行文件
    [
      viteBin,
      '--host', '127.0.0.1',
      '--port', String(FRONTEND_PORT),
      '--strictPort',
    ],
    {
      cwd: webDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        // 让 vite 知道项目根目录（用于解析 node_modules）
      },
    },
  );

  vite.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`Vite 退出码 ${code}`);
    }
  });

  // 3) 优雅退出：一起杀掉
  const shutdown = (signal: NodeJS.Signals) => {
    console.log(`\n收到 ${signal}，关闭 dev 环境…`);
    try {
      vite.kill('SIGTERM');
    } catch {
      /* ignore */
    }
    backend.close();
    setTimeout(() => process.exit(0), 200);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  console.error('dev-server 启动失败:', e);
  process.exit(1);
});