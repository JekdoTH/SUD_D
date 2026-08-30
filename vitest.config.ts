import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/tests/src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@sud-d/domain': path.join(__dirname, 'packages/domain/src/index.ts'),
      '@sud-d/contracts': path.join(__dirname, 'packages/contracts/src/index.ts'),
      '@sud-d/infrastructure': path.join(__dirname, 'packages/infrastructure/src/index.ts'),
      '@sud-d/application': path.join(__dirname, 'packages/application/src/index.ts'),
      '@sud-d/mcp-gateway': path.join(__dirname, 'packages/mcp-gateway/src/index.ts'),
    },
  },
});
