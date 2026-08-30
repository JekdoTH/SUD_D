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
