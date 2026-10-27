import fs from 'node:fs';
import path from 'node:path';
import type { SerenaRuntimePaths } from './serena-runtime-paths.js';

/** Pure offline-only configuration projection; no host environment access or writes. */
export function makeManagedSerenaConfigPlan(
  projectSerenaDir: string,
  fixtureEnvironment: Readonly<Record<string, string>> = {},
) {
  const environment: Record<string, string> = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'TEMP', 'TMP']) {
    const value = fixtureEnvironment[key];
    if (typeof value === 'string' && value.length > 0 && value.length <= 1024) environment[key] = value;
  }
  environment.SERENA_USAGE_REPORTING = 'false';
  return Object.freeze({
    environment: Object.freeze(environment),
    config: Object.freeze({
      language_backend: 'LSP',
      token_count_estimator: 'CHAR_COUNT',
      gui_log_window: false,
      web_dashboard: false,
      web_dashboard_open_on_launch: false,
      trace_lsp_communication: false,
      project_serena_folder_location: projectSerenaDir,
      trusted_project_path_patterns: [] as readonly string[],
      base_modes: ['interactive', 'editing'] as readonly string[],
      default_modes: [] as readonly string[],
      projects: [] as readonly string[],
    }),
  });
}

export function prepareManagedSerenaConfig(paths: SerenaRuntimePaths): void {
  fs.mkdirSync(paths.serenaHome, { recursive: true });
  fs.mkdirSync(paths.projectSerenaDir, { recursive: true });

  const config = makeManagedSerenaConfigPlan(paths.projectSerenaDir).config;

  const serialized = `${JSON.stringify(config, null, 2)}\n`;
  const tempPath = path.join(paths.serenaHome, `.${path.basename(paths.serenaConfigPath)}.${process.pid}.tmp`);
  fs.writeFileSync(tempPath, serialized, 'utf8');
  fs.renameSync(tempPath, paths.serenaConfigPath);
}
