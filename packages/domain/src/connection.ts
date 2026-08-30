import type { AppError } from './result.js';
import type { ConnectionState } from './types.js';

export type ConnectionProvider = 'openai_secure_mcp_tunnel';
export type ConnectionTransport = 'stdio';
export type ConnectionCredentialStatus = 'configured' | 'missing';

export interface ConnectionProfile {
  readonly profileId: string;
  readonly displayName: string;
  readonly provider: ConnectionProvider;
  readonly transport: ConnectionTransport;
  readonly deviceName: string;
  readonly autoStart: boolean;
  readonly autoRestart: boolean;
  readonly tunnelReference?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface NewConnectionProfile {
  readonly displayName: string;
  readonly provider: ConnectionProvider;
  readonly transport: ConnectionTransport;
  readonly deviceName: string;
  readonly autoStart: boolean;
  readonly autoRestart: boolean;
  readonly tunnelReference?: string;
}

export interface ConnectionProfileUpdate {
  readonly displayName?: string;
  readonly deviceName?: string;
  readonly autoStart?: boolean;
  readonly autoRestart?: boolean;
  readonly tunnelReference?: string | null;
}

export interface ConnectionSessionContext {
  readonly connectionSessionId: string;
  readonly profileId: string;
  readonly workspaceId: string;
  readonly workspaceCanonicalRoot: string;
  readonly startedAt: Date;
  readonly provider: ConnectionProvider;
  readonly transport: ConnectionTransport;
  readonly deviceName: string;
  readonly tunnelReference?: string;
}

export interface ConnectionServiceStatus {
  readonly state: ConnectionState;
  readonly session: ConnectionSessionContext | null;
  readonly error: AppError | null;
}
