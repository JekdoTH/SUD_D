import {
  CODING_SEMANTIC_READ_CAPABILITY_NAMES,
  CODING_SEMANTIC_WRITE_CAPABILITY_NAMES,
  appError,
  err,
  ok,
  type AppError,
  type AuditEvent,
  type ConnectionProfile,
  type ConnectionServiceStatus,
  type Result,
  type Workspace,
} from '@sud-d/domain';
import type {
  ActivityListInput,
  DesktopActivityDetailDto,
  DesktopActivityEventDto,
  DoctorCheckDto,
  DoctorCheckItemDto,
  DoctorCheckStatus,
} from '@sud-d/contracts';

export interface DesktopDiagnosticsDependencies {
  dataDirectoryWritable(): boolean;
  sqliteHealthy(): boolean;
  listWorkspaces(): Workspace[];
  workspaceRootStatus(root: string): { rootExists: boolean; rootIsDirectory: boolean };
  listProfiles(): ConnectionProfile[];
  hasCredential(profileId: string): boolean;
  mcpGatewayAvailable(): boolean;
  tunnelClientAvailable(): boolean;
  connectionStatus(): ConnectionServiceStatus;
  tunnelRuntimeStatus(): { readonly state: 'stopped' | 'starting' | 'healthy' | 'error'; readonly lastErrorCode?: string };
  listAuditEvents(limit: number, excludeActions?: readonly string[]): AuditEvent[];
}

export interface DesktopDiagnosticsController {
  checkDoctor(): Result<DoctorCheckDto, AppError>;
  listActivity(input: ActivityListInput): Result<DesktopActivityEventDto[], AppError>;
}

function doctorCheck(
  id: DoctorCheckItemDto['id'],
  status: DoctorCheckStatus,
  label: string,
  message: string,
  guidance?: string,
): DoctorCheckItemDto {
  return {
    id,
    status,
    label,
    message,
    ...(guidance ? { guidance } : {}),
  };
}

function overallStatus(checks: DoctorCheckItemDto[]): DoctorCheckStatus {
  if (checks.some((check) => check.status === 'error')) return 'error';
  if (checks.some((check) => check.status === 'warning')) return 'warning';
  return 'healthy';
}

function safeConnectionErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'CONNECTION_CREDENTIAL_MISSING':
      return 'Credential not configured';
    case 'CONNECTION_WORKSPACE_NOT_SELECTED':
    case 'WORKSPACE_INVALID':
      return 'Select a workspace';
    case 'TUNNEL_CLIENT_NOT_FOUND':
      return 'Tunnel client unavailable';
    case 'MCP_GATEWAY_ENTRY_NOT_FOUND':
      return 'MCP Gateway unavailable';
    case 'TUNNEL_START_FAILED':
    case 'TUNNEL_HEALTH_FAILED':
    case 'TUNNEL_EXITED_UNEXPECTEDLY':
    case 'CONNECTION_RUNTIME_START_FAILED':
      return 'Secure Tunnel unavailable';
    case 'TUNNEL_STOP_FAILED':
    case 'CONNECTION_RUNTIME_STOP_FAILED':
      return 'Connection runtime could not stop cleanly';
    default:
      return 'Connection runtime unavailable';
  }
}

function runtimeCheck(status: ConnectionServiceStatus): DoctorCheckItemDto {
  switch (status.state) {
    case 'stopped':
      return doctorCheck('connection_runtime', 'healthy', 'Connection runtime', 'Ready to connect');
    case 'connected':
      return doctorCheck('connection_runtime', 'healthy', 'Connection runtime', 'Connected');
    case 'degraded':
      return doctorCheck('connection_runtime', 'warning', 'Connection runtime', 'Connection needs attention', 'Reconnect ChatGPT');
    case 'error':
      return doctorCheck('connection_runtime', 'error', 'Connection runtime', safeConnectionErrorMessage(status.error?.code), 'Review Connection');
    case 'starting':
    case 'waiting_for_tunnel':
    case 'waiting_for_client':
    case 'stopping':
      return doctorCheck('connection_runtime', 'warning', 'Connection runtime', 'Connection transition in progress');
  }
}

function gatewayCheck(
  available: boolean,
  status: ConnectionServiceStatus,
): DoctorCheckItemDto {
  if (!available) {
    return doctorCheck('gateway', 'error', 'MCP Gateway', 'MCP Gateway unavailable', 'Rebuild SUD-D');
  }
  if (status.state === 'error') {
    return doctorCheck('gateway', 'warning', 'MCP Gateway', 'Gateway runtime state is unavailable while connection is in error');
  }
  if (status.state === 'starting' || status.state === 'waiting_for_tunnel' || status.state === 'stopping') {
    return doctorCheck('gateway', 'warning', 'MCP Gateway', 'Gateway connection is transitioning');
  }
  if (status.state === 'waiting_for_client' || status.state === 'connected' || status.state === 'degraded') {
    return doctorCheck('gateway', 'healthy', 'MCP Gateway', 'Gateway is available to the current connection');
  }
  return doctorCheck('gateway', 'healthy', 'MCP Gateway', 'Gateway is available and idle');
}

function tunnelCheck(
  status: ReturnType<DesktopDiagnosticsDependencies['tunnelRuntimeStatus']>,
): DoctorCheckItemDto {
  switch (status.state) {
    case 'stopped':
      return doctorCheck('tunnel', 'healthy', 'Secure Tunnel', 'Secure Tunnel is idle');
    case 'starting':
      return doctorCheck('tunnel', 'warning', 'Secure Tunnel', 'Secure Tunnel is starting');
    case 'healthy':
      return doctorCheck('tunnel', 'healthy', 'Secure Tunnel', 'Secure Tunnel is ready');
    case 'error':
      return doctorCheck('tunnel', 'error', 'Secure Tunnel', 'Secure Tunnel unavailable', 'Review Connection');
  }
}

function clientCheck(status: ConnectionServiceStatus): DoctorCheckItemDto {
  if (status.state === 'connected') {
    return doctorCheck('client', 'healthy', 'ChatGPT client', 'ChatGPT is connected');
  }
  if (status.state === 'waiting_for_client') {
    return doctorCheck('client', 'warning', 'ChatGPT client', 'Waiting for ChatGPT', 'Connect ChatGPT');
  }
  if (status.state === 'degraded') {
    return doctorCheck('client', 'warning', 'ChatGPT client', 'ChatGPT is disconnected', 'Reconnect ChatGPT');
  }
  if (status.state === 'error') {
    return doctorCheck('client', 'warning', 'ChatGPT client', 'Client status unavailable while connection is in error');
  }
  if (status.state === 'starting' || status.state === 'waiting_for_tunnel' || status.state === 'stopping') {
    return doctorCheck('client', 'warning', 'ChatGPT client', 'Client connection is not ready yet');
  }
  return doctorCheck('client', 'healthy', 'ChatGPT client', 'Not connected — ready when needed');
}

const ACTIVITY_PRESENTATION: Record<string, {
  readonly title: string;
  readonly category: DesktopActivityEventDto['category'];
  readonly tone: DesktopActivityEventDto['tone'];
}> = {
  'connection.start.requested': { title: 'Connection start requested', category: 'connection', tone: 'info' },
  'connection.started': { title: 'Connection started', category: 'connection', tone: 'success' },
  'connection.stop.requested': { title: 'Connection stop requested', category: 'connection', tone: 'info' },
  'connection.stopped': { title: 'Connection stopped', category: 'connection', tone: 'success' },
  'connection.failed': { title: 'Connection failed', category: 'connection', tone: 'error' },
  'tunnel.ready': { title: 'Secure Tunnel ready', category: 'tunnel', tone: 'success' },
  'tunnel.failed': { title: 'Secure Tunnel failed', category: 'tunnel', tone: 'error' },
};

const ACTIVITY_NOISE_ACTIONS = new Set([
  'workspace:list',
  'connection-profile:list',
  'connection-profile:read',
  'credential:status',
]);

const SEMANTIC_READ_ACTIVITY_CAPABILITIES = new Set<string>(CODING_SEMANTIC_READ_CAPABILITY_NAMES);
const SEMANTIC_WRITE_ACTIVITY_CAPABILITIES = new Set<string>(CODING_SEMANTIC_WRITE_CAPABILITY_NAMES);

function isRoutineSemanticReadActivity(event: AuditEvent): boolean {
  const capability = event.metadata?.capability;
  return event.action === 'tool_kernel.invoke'
    && typeof capability === 'string'
    && SEMANTIC_READ_ACTIVITY_CAPABILITIES.has(capability)
    && (event.resultCode === 'EXECUTION_AUTHORIZED' || event.resultCode === 'EXECUTED');
}

function isRoutineSemanticWriteAuthorization(event: AuditEvent): boolean {
  const capability = event.metadata?.capability;
  return event.action === 'tool_kernel.invoke'
    && typeof capability === 'string'
    && SEMANTIC_WRITE_ACTIVITY_CAPABILITIES.has(capability)
    && event.resultCode === 'EXECUTION_AUTHORIZED';
}

function semanticWriteActivityPresentation(event: AuditEvent): {
  readonly title: string;
  readonly category: 'workspace';
  readonly tone: 'success' | 'warning' | 'error';
} | null {
  const capability = event.metadata?.capability;
  if (event.action !== 'tool_kernel.invoke'
    || typeof capability !== 'string'
    || !SEMANTIC_WRITE_ACTIVITY_CAPABILITIES.has(capability)) {
    return null;
  }
  const rename = capability === 'code.rename';
  if (event.resultCode === 'EXECUTED') {
    return {
      title: rename ? 'Renamed a symbol' : 'Edited a file',
      category: 'workspace',
      tone: 'success',
    };
  }
  if (event.resultCode === 'APPROVAL_REQUIRED') {
    return {
      title: rename ? 'Symbol rename needs approval' : 'Code edit needs approval',
      category: 'workspace',
      tone: 'warning',
    };
  }
  return {
    title: rename ? 'Symbol rename failed' : 'Code edit failed',
    category: 'workspace',
    tone: 'error',
  };
}

const SAFE_OPERATIONS = new Set(['start', 'stop', 'restart']);
const SAFE_STATES = new Set([
  'stopped',
  'starting',
  'waiting_for_tunnel',
  'waiting_for_client',
  'connected',
  'degraded',
  'stopping',
  'error',
]);

function genericActivityTitle(action: string): string {
  return action
    .split(/[.:_-]+/u)
    .filter(Boolean)
    .map((part, index) => index === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part)
    .join(' ');
}

function activityDetails(event: AuditEvent): DesktopActivityDetailDto[] {
  const details: DesktopActivityDetailDto[] = [];
  const operation = event.metadata['operation'];
  if (typeof operation === 'string' && SAFE_OPERATIONS.has(operation)) {
    details.push({ label: 'Operation', value: operation });
  }
  const state = event.metadata['state'];
  if (typeof state === 'string' && SAFE_STATES.has(state)) {
    details.push({ label: 'State', value: state });
  }
  return details;
}

function toActivityEvent(event: AuditEvent): DesktopActivityEventDto {
  const semanticWrite = semanticWriteActivityPresentation(event);
  const presentation = ACTIVITY_PRESENTATION[event.action];
  const failed = event.resultCode !== 'OK';
  return {
    id: event.id,
    timestamp: event.timestamp.toISOString(),
    action: event.action,
    title: semanticWrite?.title ?? presentation?.title ?? genericActivityTitle(event.action),
    category: semanticWrite?.category ?? presentation?.category
      ?? (event.action.startsWith('workspace') ? 'workspace'
        : event.action.includes('profile') || event.action.includes('credential') ? 'configuration'
          : 'other'),
    tone: semanticWrite?.tone ?? (failed ? 'error' : presentation?.tone ?? 'success'),
    resultCode: event.resultCode,
    details: activityDetails(event),
  };
}

export function createDesktopDiagnosticsController(
  dependencies: DesktopDiagnosticsDependencies,
): DesktopDiagnosticsController {
  return {
    checkDoctor(): Result<DoctorCheckDto, AppError> {
      try {
        const dataDirectoryWritable = dependencies.dataDirectoryWritable();
        const sqliteHealthy = dependencies.sqliteHealthy();
        const workspaces = dependencies.listWorkspaces();
        const workspaceChecks = workspaces.map((workspace) => ({
          workspaceId: workspace.id,
          displayName: workspace.displayName,
          ...dependencies.workspaceRootStatus(workspace.canonicalRoot),
        }));
        const activeWorkspace = workspaces.find((workspace) => workspace.isActive);
        const activeWorkspaceStatus = activeWorkspace
          ? dependencies.workspaceRootStatus(activeWorkspace.canonicalRoot)
          : null;
        const profiles = dependencies.listProfiles();
        const activeProfile = profiles[0];
        const credentialConfigured = activeProfile
          ? dependencies.hasCredential(activeProfile.profileId)
          : false;
        const tunnelConfigured = Boolean(activeProfile?.tunnelReference);
        const gatewayAvailable = dependencies.mcpGatewayAvailable();
        const tunnelClientAvailable = dependencies.tunnelClientAvailable();
        const connectionStatus = dependencies.connectionStatus();
        const tunnelRuntimeStatus = dependencies.tunnelRuntimeStatus();

        const checks: DoctorCheckItemDto[] = [
          dataDirectoryWritable
            ? doctorCheck('data_directory', 'healthy', 'Application data', 'Application data directory is writable')
            : doctorCheck('data_directory', 'error', 'Application data', 'Application data directory is not writable', 'Check local app-data permissions'),
          sqliteHealthy
            ? doctorCheck('database', 'healthy', 'Database', 'SQLite database is ready')
            : doctorCheck('database', 'error', 'Database', 'SQLite database is unavailable', 'Restart SUD-D and review Environment'),
          !activeWorkspace
            ? doctorCheck('active_workspace', 'warning', 'Active workspace', 'No active workspace selected', 'Add or select a workspace')
            : activeWorkspaceStatus?.rootExists && activeWorkspaceStatus.rootIsDirectory
              ? doctorCheck('active_workspace', 'healthy', 'Active workspace', `${activeWorkspace.displayName} is available`)
              : doctorCheck('active_workspace', 'error', 'Active workspace', `${activeWorkspace.displayName} is unavailable`, 'Select a valid workspace'),
          activeProfile
            ? doctorCheck('connection_profile', 'healthy', 'Connection profile', 'Local connection profile is configured')
            : doctorCheck('connection_profile', 'warning', 'Connection profile', 'Connection profile not configured', 'Open Connection to configure this device'),
          credentialConfigured
            ? doctorCheck('credential', 'healthy', 'Credential', 'Credential configured')
            : doctorCheck('credential', 'warning', 'Credential', 'Credential not configured', 'Configure credential'),
          tunnelConfigured
            ? doctorCheck('tunnel_configuration', 'healthy', 'Secure Tunnel setup', 'Secure Tunnel reference configured')
            : doctorCheck('tunnel_configuration', 'warning', 'Secure Tunnel setup', 'Secure Tunnel reference not configured', 'Configure Secure Tunnel'),
          gatewayAvailable
            ? doctorCheck('mcp_gateway', 'healthy', 'MCP Gateway entrypoint', 'Fixed MCP Gateway entrypoint is available')
            : doctorCheck('mcp_gateway', 'error', 'MCP Gateway entrypoint', 'MCP Gateway unavailable', 'Rebuild SUD-D'),
          tunnelClientAvailable
            ? doctorCheck('tunnel_client', 'healthy', 'Secure Tunnel client', 'OpenAI Secure Tunnel client is available')
            : doctorCheck('tunnel_client', 'warning', 'Secure Tunnel client', 'Tunnel client unavailable', 'Install OpenAI Secure Tunnel'),
          runtimeCheck(connectionStatus),
          gatewayCheck(gatewayAvailable, connectionStatus),
          tunnelCheck(tunnelRuntimeStatus),
          clientCheck(connectionStatus),
        ];

        const status = overallStatus(checks);
        return ok({
          dataDirectoryWritable,
          sqliteHealthy,
          workspaceChecks,
          overallStatus: status,
          summary: status === 'healthy' ? 'Ready' : status === 'warning' ? 'Needs attention' : 'Action required',
          checks,
        });
      } catch {
        return err(appError('INTERNAL_ERROR', 'Failed to run environment checks'));
      }
    },

    listActivity(input: ActivityListInput): Result<DesktopActivityEventDto[], AppError> {
      try {
        return ok(
          dependencies.listAuditEvents(input.limit, [...ACTIVITY_NOISE_ACTIONS])
            .filter((event) => !ACTIVITY_NOISE_ACTIONS.has(event.action))
            .filter((event) => !isRoutineSemanticReadActivity(event))
            .filter((event) => !isRoutineSemanticWriteAuthorization(event))
            .map(toActivityEvent),
        );
      } catch {
        return err(appError('INTERNAL_ERROR', 'Failed to retrieve activity'));
      }
    },
  };
}
