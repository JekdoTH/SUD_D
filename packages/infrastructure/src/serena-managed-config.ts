import fs from 'node:fs';
import path from 'node:path';
import type { SerenaRuntimePaths } from './serena-runtime-paths.js';

export function prepareManagedSerenaConfig(paths: SerenaRuntimePaths): void {
  fs.mkdirSync(paths.serenaHome, { recursive: true });
  fs.mkdirSync(paths.projectSerenaDir, { recursive: true });

  const config = {
    language_backend: 'LSP',
    gui_log_window: false,
    web_dashboard: false,
    web_dashboard_open_on_launch: false,
    trace_lsp_communication: false,
    project_serena_folder_location: paths.projectSerenaDir,
    trusted_project_path_patterns: [],
    base_modes: ['interactive', 'editing'],
    default_modes: [],
    projects: [],
  };

  const serialized = `${JSON.stringify(config, null, 2)}\n`;
  const tempPath = path.join(paths.serenaHome, `.${path.basename(paths.serenaConfigPath)}.${process.pid}.tmp`);
  fs.writeFileSync(tempPath, serialized, 'utf8');
  fs.renameSync(tempPath, paths.serenaConfigPath);
}
