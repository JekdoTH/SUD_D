import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  SERENA_ENGINE_MANIFEST,
  createSerenaRuntimePaths,
  prepareManagedSerenaConfig,
} from '@sud-d/infrastructure';

const roots: string[] = [];
const temp = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sud-d-serena-foundation-'));
  roots.push(root);
  return root;
};

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('Serena managed foundation', () => {
  it('pins the approved Serena Product Mode contract', () => {
    expect(SERENA_ENGINE_MANIFEST.version).toBe('1.7.0');
    expect(SERENA_ENGINE_MANIFEST.upstreamCommit).toBe('949a27ef1e5fda1a6e7b561e777bcece345c6ffd');
    expect(SERENA_ENGINE_MANIFEST.transport).toBe('stdio');
    expect(SERENA_ENGINE_MANIFEST.languageBackend).toBe('LSP');
    expect(SERENA_ENGINE_MANIFEST.modes).toEqual(['no-memories']);
    expect(SERENA_ENGINE_MANIFEST.expectedToolNames).toHaveLength(22);
    expect([...SERENA_ENGINE_MANIFEST.expectedToolNames].sort()).toEqual(SERENA_ENGINE_MANIFEST.expectedToolNames);
  });

  it('keeps Serena home and project metadata outside the source workspace', () => {
    const root = temp();
    const dataRoot = path.join(root, 'data');
    const workspaceRoot = path.join(root, 'workspace');
    fs.mkdirSync(path.join(workspaceRoot, '.serena'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, '.serena', 'developer-marker.txt'), 'keep');

    const paths = createSerenaRuntimePaths(dataRoot, {
      workspaceId: 'workspace-1',
      canonicalRoot: workspaceRoot,
      projectName: 'workspace',
    });
    prepareManagedSerenaConfig(paths);

    expect(paths.serenaHome.startsWith(dataRoot)).toBe(true);
    expect(paths.projectSerenaDir.startsWith(dataRoot)).toBe(true);
    expect(paths.projectSerenaDir).not.toContain(path.join(workspaceRoot, '.serena'));
    expect(fs.existsSync(paths.projectSerenaDir)).toBe(true);
    expect(fs.readFileSync(path.join(workspaceRoot, '.serena', 'developer-marker.txt'), 'utf8')).toBe('keep');

    const config = fs.readFileSync(paths.serenaConfigPath, 'utf8');
    expect(config).toContain(JSON.stringify(paths.projectSerenaDir));
    expect(config).toContain('"trusted_project_path_patterns": []');
    expect(config).not.toContain(workspaceRoot + path.sep + '.serena');
  });
});
