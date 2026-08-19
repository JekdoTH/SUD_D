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
