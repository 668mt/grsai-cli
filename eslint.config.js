import antfu from '@antfu/eslint-config';

export default antfu({
  type: 'lib',
  typescript: true,
  stylistic: true,
  formatters: {
    css: false,
    html: false,
    markdown: false,
  },
  ignores: [
    'dist/**',
    'node_modules/**',
    'coverage/**',
    '*.config.ts',
    '*.config.js',
  ],
  rules: {
    'no-console': 'off',
    'ts/consistent-type-imports': ['error', { prefer: 'type-imports' }],
    'ts/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  },
});