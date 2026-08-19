// @ts-check
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-require-imports': 'error',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
  ignorePatterns: ['dist/', 'dist-electron/', 'out/', '**/*.d.ts', 'node_modules/', '*.config.ts', '*.config.js', 'vite.config.*'],
};
