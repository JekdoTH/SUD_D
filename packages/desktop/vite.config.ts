import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '../..');

function resolveBuildRevision(): string {
  let revision = '';
  try {
    revision = execFileSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    revision = '';
  }
  if (!/^[0-9a-fA-F]{40}$/.test(revision)) {
    if (process.env.SUD_D_REQUIRE_BUILD_REVISION === '1') throw new Error('A full Git build revision is required.');
    return '0'.repeat(40);
  }
  if (process.env.SUD_D_REQUIRE_CLEAN_RELEASE === '1') {
    const dirty = execFileSync('git', ['-C', repoRoot, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim();
    if (dirty) throw new Error('Release packaging requires a clean tracked worktree.');
  }
  return revision.toLowerCase();
}

function resolveUpdatePublicKey(): string {
  const file = process.env.SUD_D_RELEASE_PUBLIC_KEY_FILE;
  if (!file) {
    if (process.env.SUD_D_REQUIRE_UPDATE_PUBLIC_KEY === '1') throw new Error('SUD_D_RELEASE_PUBLIC_KEY_FILE is required for packaging.');
    return '';
  }
  const pem = readFileSync(file, 'utf8').trim();
  if (!pem.includes('-----BEGIN PUBLIC KEY-----') || !pem.includes('-----END PUBLIC KEY-----')) {
    throw new Error('Release public key file is invalid.');
  }
  return `${pem}\n`;
}

const buildRevision = resolveBuildRevision();
const updatePublicKeyPem = resolveUpdatePublicKey();

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
        entry: {
          main: path.join(__dirname, 'electron/main.ts'),
          'git-worker': path.join(__dirname, 'electron/git-worker.ts'),
        },
        vite: {
          resolve: { alias: workspaceAliases },
          define: {
            __SUD_D_BUILD_REVISION__: JSON.stringify(buildRevision),
            __SUD_D_UPDATE_PUBLIC_KEY_PEM__: JSON.stringify(updatePublicKeyPem),
          },
          build: {
            outDir: path.join(__dirname, 'dist-electron'),
            // Native addons and native FFI loaders must remain external so their prebuilt binaries resolve at runtime.
            rollupOptions: {
              external: ['better-sqlite3', 'koffi'],
            },
          },
        },
      },
      preload: {
        input: path.join(__dirname, 'electron/preload.ts'),
        vite: {
          resolve: { alias: workspaceAliases },
          define: {
            __SUD_D_BUILD_REVISION__: JSON.stringify(buildRevision),
            __SUD_D_UPDATE_PUBLIC_KEY_PEM__: JSON.stringify(updatePublicKeyPem),
          },
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
      ...workspaceAliases,
    },
  },
});
