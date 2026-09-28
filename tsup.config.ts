import { cpSync } from 'node:fs';
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    cli: 'src/cli.ts',
    index: 'src/index.ts',
  },
  format: ['esm'],
  target: 'node18',
  outExtension: () => ({ js: '.js' }),
  clean: true,
  dts: true,
  sourcemap: true,
  shims: false,
  external: [],
  splitting: false,
  minify: false,
  esbuildOptions(options) {
    options.platform = 'node';
    // 不在 ESM 文件里加 shebang（Node 24+ 会把首行 #! 视作非法 token）
    // 调用方式：node dist/cli.js
    options.banner = undefined;
  },
  // build 完成后把 skills/ 复制到 dist/skills/，让 install 命令从打包文件位置定位
  onSuccess: async () => {
    cpSync('skills', 'dist/skills', { recursive: true });
  },
});