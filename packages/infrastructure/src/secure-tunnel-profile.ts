import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ConnectionRuntimeFailure,
  type ConnectionSessionContext,
} from '@sud-d/domain';
import { credentialEnvVarNameForProfile } from './credential-store.js';

export interface SecureTunnelProfilePlan {
  readonly runtimeRoot: string;
  readonly profilePath: string;
  readonly healthUrlFile: string;
  readonly content: string;
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function quoteCommandPath(value: string): string {
  if (value.includes('"') || value.includes('\r') || value.includes('\n')) {
    throw new ConnectionRuntimeFailure('TUNNEL_PROFILE_INVALID');
  }
  return `"${value}"`;
}

function validateTunnelReference(value: string | undefined): string {
  if (!value || !/^tunnel_[A-Za-z0-9_-]+$/.test(value)) {
    throw new ConnectionRuntimeFailure('TUNNEL_PROFILE_INVALID');
  }
  return value;
}

export function getDefaultMcpGatewayEntryPath(): string {
  return fileURLToPath(new URL('../../mcp-gateway/dist/stdio-entry.js', import.meta.url));
}

export function prepareSecureTunnelProfile(
  context: ConnectionSessionContext,
  dataRoot: string,
  nodeExecutablePath: string,
  gatewayEntryPath: string,
): SecureTunnelProfilePlan {
  if (
    context.provider !== 'openai_secure_mcp_tunnel' ||
    context.transport !== 'stdio'
  ) {
    throw new ConnectionRuntimeFailure('TUNNEL_PROFILE_INVALID');
  }

  const tunnelReference = validateTunnelReference(context.tunnelReference);
  const runtimeRoot = path.join(dataRoot, 'runtime', 'secure-tunnel');
  const profilePath = path.join(runtimeRoot, 'profiles', `${context.profileId}.yaml`);
  const healthUrlFile = path.join(runtimeRoot, 'health', `${context.profileId}.url`);
  const credentialReference = `env:${credentialEnvVarNameForProfile(context.profileId)}`;
  const gatewayCommand = `${quoteCommandPath(nodeExecutablePath)} ${quoteCommandPath(gatewayEntryPath)}`;

  const content = [
    'config_version: 1',
    'control_plane:',
    `  base_url: ${yamlString('https://api.openai.com')}`,
    `  tunnel_id: ${yamlString(tunnelReference)}`,
    `  api_key: ${yamlString(credentialReference)}`,
    'health:',
    `  listen_addr: ${yamlString('127.0.0.1:0')}`,
    `  url_file: ${yamlString(healthUrlFile)}`,
    'admin_ui:',
    '  open_browser: false',
    'log:',
    '  level: info',
    '  format: json',
    'mcp:',
    '  commands:',
    '    - channel: main',
    `      command: ${yamlString(gatewayCommand)}`,
    '',
  ].join('\n');

  return { runtimeRoot, profilePath, healthUrlFile, content };
}

export function writeSecureTunnelProfile(plan: SecureTunnelProfilePlan): void {
  const profileDir = path.dirname(plan.profilePath);
  const healthDir = path.dirname(plan.healthUrlFile);
  fs.mkdirSync(profileDir, { recursive: true });
  fs.mkdirSync(healthDir, { recursive: true });

  try {
    fs.rmSync(plan.healthUrlFile, { force: true });
    const tempPath = `${plan.profilePath}.tmp`;
    fs.writeFileSync(tempPath, plan.content, { encoding: 'utf8' });
    fs.renameSync(tempPath, plan.profilePath);
  } catch {
    throw new ConnectionRuntimeFailure('TUNNEL_PROFILE_INVALID');
  }
}
