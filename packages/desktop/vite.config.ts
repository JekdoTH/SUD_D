import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
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
