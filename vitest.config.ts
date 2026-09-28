import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/*.config.ts'],
    },
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
      '@commands': new URL('./src/commands', import.meta.url).pathname,
      '@api': new URL('./src/api', import.meta.url).pathname,
      '@utils': new URL('./src/utils', import.meta.url).pathname,
      '@types': new URL('./src/types', import.meta.url).pathname,
    },
  },
});