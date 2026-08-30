// ---------------------------------------------------------------------------
// Domain vocabulary types
// ---------------------------------------------------------------------------

export type ClientSessionType = 'desktop' | 'mcp-stdio';

export interface ClientSession {
  readonly id: string;
  readonly type: ClientSessionType;
}

export type Effect = 'read' | 'create' | 'modify' | 'execute' | 'delete';

export type Sensitivity = 'normal' | 'sensitive' | 'credential';

export type Risk = 'low' | 'medium' | 'high' | 'critical';

export type PolicyDecisionKind = 'allow' | 'ask' | 'deny';

export interface PolicyDecision {
  readonly decision: PolicyDecisionKind;
  readonly reason: string;
}

export interface Workspace {
  readonly id: string;
  readonly displayName: string;
  readonly canonicalRoot: string;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface InternalRoot {
  readonly canonicalPath: string;
  readonly label: string;
}

export interface AuditEvent {
  readonly id: string;
  readonly timestamp: Date;
  readonly sessionId: string;
  readonly sessionType: ClientSessionType;
  readonly action: string;
  readonly workspaceId?: string;
  readonly resourcePath?: string;
  readonly policyDecision?: PolicyDecisionKind;
  readonly resultCode: string;
  readonly durationMs: number;
  readonly metadata: Record<string, string | number | boolean>;
}

export const CONNECTION_STATES = [
  'stopped',
  'starting',
  'waiting_for_tunnel',
  'waiting_for_client',
  'connected',
  'degraded',
  'stopping',
  'error',
] as const;

export type ConnectionState = (typeof CONNECTION_STATES)[number];

export type GatewayState = 'stopped' | 'starting' | 'healthy' | 'error';
export type TunnelState = 'stopped' | 'starting' | 'healthy' | 'error';
export type ClientConnectionState = 'disconnected' | 'connected';

export type ConnectionStateTransitionErrorCode = 'INVALID_CONNECTION_STATE_TRANSITION';

export interface ConnectionStateTransitionError {
  readonly code: ConnectionStateTransitionErrorCode;
  readonly from: ConnectionState;
  readonly to: ConnectionState;
  readonly message: string;
}

export type ConnectionStateTransitionResult =
  | { readonly ok: true; readonly state: ConnectionState }
  | { readonly ok: false; readonly error: ConnectionStateTransitionError };

const CONNECTION_STATE_TRANSITIONS: Readonly<Record<ConnectionState, readonly ConnectionState[]>> = {
  stopped: ['starting'],
  starting: ['waiting_for_tunnel', 'stopping', 'error'],
  waiting_for_tunnel: ['waiting_for_client', 'stopping', 'error'],
  waiting_for_client: ['connected', 'degraded', 'stopping', 'error'],
  connected: ['degraded', 'stopping', 'error'],
  degraded: ['connected', 'stopping', 'error'],
  stopping: ['stopped', 'error'],
  error: ['starting', 'stopping'],
};

export function canTransitionConnectionState(
  from: ConnectionState,
  to: ConnectionState,
): boolean {
  return CONNECTION_STATE_TRANSITIONS[from].includes(to);
}

export function transitionConnectionState(
  from: ConnectionState,
  to: ConnectionState,
): ConnectionStateTransitionResult {
  if (!canTransitionConnectionState(from, to)) {
    return {
      ok: false,
      error: {
        code: 'INVALID_CONNECTION_STATE_TRANSITION',
        from,
        to,
        message: `Invalid connection state transition: ${from} → ${to}`,
      },
    };
  }

  return { ok: true, state: to };
}
