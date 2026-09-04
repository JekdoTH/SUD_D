import crypto from 'node:crypto';
import path from 'node:path';
import type { CodingEngineWorkspaceContext } from '@sud-d/domain';
import { SERENA_ENGINE_MANIFEST } from './serena-engine-manifest.js';

export interface SerenaRuntimePaths {
  readonly dataRoot: string;
  readonly engineRoot: string;
  readonly toolDir: string;
  readonly binDir: string;
  readonly pythonDir: string;
  readonly cacheDir: string;
  readonly workspaceStateRoot: string;
  readonly serenaHome: string;
  readonly serenaConfigPath: string;
  readonly projectSerenaDir: string;
}

export function createSerenaRuntimePaths(
  dataRoot: string,
  workspace: CodingEngineWorkspaceContext,
): SerenaRuntimePaths {
  const version = SERENA_ENGINE_MANIFEST.version;
  const engineRoot = path.join(dataRoot, 'coding-engines', 'serena', version);
  const workspaceKey = crypto
    .createHash('sha256')
    .update(workspace.canonicalRoot.toLowerCase())
    .digest('hex');
  const workspaceStateRoot = path.join(dataRoot, 'coding-engines', 'serena', 'state', version, workspaceKey);
  const serenaHome = path.join(workspaceStateRoot, 'home');

  return {
    dataRoot,
    engineRoot,
    toolDir: path.join(engineRoot, 'uv-tools'),
    binDir: path.join(engineRoot, 'bin'),
    pythonDir: path.join(engineRoot, 'python'),
    cacheDir: path.join(engineRoot, 'uv-cache'),
    workspaceStateRoot,
    serenaHome,
    serenaConfigPath: path.join(serenaHome, 'serena_config.yml'),
    projectSerenaDir: path.join(workspaceStateRoot, 'project-data', '.serena'),
  };
}
