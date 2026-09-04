import path from 'node:path';

export const SERENA_SPIKE_VERSION = '1.7.0';
export const SERENA_SPIKE_UPSTREAM_COMMIT = '949a27ef1e5fda1a6e7b561e777bcece345c6ffd';

export interface SerenaSpikePaths {
  readonly root: string;
  readonly toolDir: string;
  readonly binDir: string;
  readonly pythonDir: string;
  readonly cacheDir: string;
  readonly projectDir: string;
}

export function createSerenaSpikePaths(root: string): SerenaSpikePaths {
  return {
    root,
    toolDir: path.join(root, 'uv-tools'),
    binDir: path.join(root, 'bin'),
    pythonDir: path.join(root, 'python'),
    cacheDir: path.join(root, 'uv-cache'),
    projectDir: path.join(root, 'project'),
  };
}

export function buildUvEnvironment(paths: SerenaSpikePaths): Record<string, string> {
  return {
    UV_TOOL_DIR: paths.toolDir,
    UV_TOOL_BIN_DIR: paths.binDir,
    UV_PYTHON_INSTALL_DIR: paths.pythonDir,
    UV_CACHE_DIR: paths.cacheDir,
    UV_NO_MODIFY_PATH: '1',
  };
}

export function buildSerenaInstallArgs(): readonly string[] {
  return ['tool', 'install', '--python', '3.13', `serena-agent==${SERENA_SPIKE_VERSION}`];
}

export function buildSerenaServerArgs(projectDir: string): readonly string[] {
  return [
    'start-mcp-server',
    '--project', projectDir,
    '--context', 'desktop-app',
    '--mode', 'no-onboarding',
    '--open-web-dashboard', 'false',
  ];
}
