import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve workspace packages from TypeScript source — no need to pre-build dist/
const workspaceAliases = {
  '@sud-d/domain': path.join(__dirname, '../domain/src/index.ts'),
  '@sud-d/contracts': path.join(__dirname, '../contracts/src/index.ts'),
  '@sud-d/infrastructure': path.join(__dirname, '../infrastructure/src/index.ts'),
  '@sud-d/application': path.join(__dirname, '../application/src/index.ts'),
};

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: path.join(__dirname, 'electron/main.ts'),
        vite: {
          resolve: { alias: workspaceAliases },
          build: {
            outDir: path.join(__dirname, 'dist-electron'),
            // better-sqlite3 is a native addon — must remain external
            rollupOptions: {
              external: ['better-sqlite3'],
            },
          },
        },
      },
      preload: {
        input: path.join(__dirname, 'electron/preload.ts'),
        vite: {
          resolve: { alias: workspaceAliases },
          build: {
            outDir: path.join(__dirname, 'dist-electron'),
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
    }),
  ],
  root: path.join(__dirname, 'src'),
  base: './',
  build: {
    outDir: path.join(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: path.join(__dirname, 'src', 'index.html'),
    },
  },
  resolve: {
    alias: {
      '@': path.join(__dirname, 'src'),
    },
  },
});
