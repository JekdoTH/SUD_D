import type {
  ConnectionStateDto,
  DesktopConnectionSnapshotDto,
} from '@sud-d/contracts';

export type ConnectionTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface ConnectionStatePresentation {
  readonly label: string;
  readonly description: string;
  readonly tone: ConnectionTone;
}

export type GatewayPresentationState = 'stopped' | 'starting' | 'ready' | 'error';
export type TunnelPresentationState = 'stopped' | 'starting' | 'ready' | 'error';
export type ClientPresentationState = 'disconnected' | 'connected';

export interface ConnectionComponentStatuses {
  readonly gateway: GatewayPresentationState;
  readonly tunnel: TunnelPresentationState;
  readonly client: ClientPresentationState;
}

export type ConnectionPrimaryAction =
  | { readonly action: 'connect'; readonly enabled: boolean; readonly reason?: string }
  | { readonly action: 'disconnect'; readonly enabled: boolean; readonly reason?: string }
  | { readonly action: 'restart'; readonly enabled: boolean; readonly reason?: string };

export function presentConnectionState(state: ConnectionStateDto): ConnectionStatePresentation {
  switch (state) {
    case 'stopped':
      return { label: 'Disconnected', description: 'ChatGPT is not connected to this device.', tone: 'neutral' };
    case 'starting':
      return { label: 'Starting', description: 'Preparing the local connection runtime.', tone: 'info' };
    case 'waiting_for_tunnel':
      return { label: 'Starting tunnel', description: 'Opening the secure connection to ChatGPT.', tone: 'warning' };
    case 'waiting_for_client':
      return { label: 'Waiting for ChatGPT', description: 'Secure Tunnel is ready. Waiting for the client to connect.', tone: 'warning' };
    case 'connected':
      return { label: 'Connected', description: 'ChatGPT is connected to the selected workspace.', tone: 'success' };
    case 'degraded':
      return { label: 'Needs attention', description: 'The connection is partially available.', tone: 'warning' };
    case 'stopping':
      return { label: 'Disconnecting', description: 'Closing the secure connection safely.', tone: 'info' };
    case 'error':
      return { label: 'Connection error', description: 'The connection needs attention before it can continue.', tone: 'danger' };
  }
}

export function deriveConnectionComponentStatuses(state: ConnectionStateDto): ConnectionComponentStatuses {
  switch (state) {
    case 'stopped':
      return { gateway: 'stopped', tunnel: 'stopped', client: 'disconnected' };
    case 'starting':
    case 'waiting_for_tunnel':
      return { gateway: 'starting', tunnel: 'starting', client: 'disconnected' };
    case 'waiting_for_client':
      return { gateway: 'ready', tunnel: 'ready', client: 'disconnected' };
    case 'connected':
      return { gateway: 'ready', tunnel: 'ready', client: 'connected' };
    case 'degraded':
      return { gateway: 'ready', tunnel: 'ready', client: 'disconnected' };
    case 'stopping':
      return { gateway: 'ready', tunnel: 'ready', client: 'disconnected' };
    case 'error':
      return { gateway: 'error', tunnel: 'error', client: 'disconnected' };
  }
}

export function getConnectionPrimaryAction(
  snapshot: DesktopConnectionSnapshotDto,
  hasActiveWorkspace: boolean,
): ConnectionPrimaryAction {
  const state = snapshot.runtime.state;

  if (state === 'connected' || state === 'degraded') {
    return { action: 'disconnect', enabled: true };
  }

  if (
    state === 'starting' ||
    state === 'waiting_for_tunnel' ||
    state === 'waiting_for_client' ||
    state === 'stopping'
  ) {
    return { action: 'disconnect', enabled: state !== 'stopping' };
  }

  if (state === 'error') {
    return { action: 'restart', enabled: snapshot.profile !== null };
  }

  if (!snapshot.profile) {
    return { action: 'connect', enabled: false, reason: 'Connection setup required' };
  }
  if (!hasActiveWorkspace) {
    return { action: 'connect', enabled: false, reason: 'Select a workspace first' };
  }
  if (!snapshot.profile.tunnelConfigured) {
    return { action: 'connect', enabled: false, reason: 'Secure Tunnel setup required' };
  }
  if (snapshot.credentialStatus !== 'configured') {
    return { action: 'connect', enabled: false, reason: 'Credential setup required' };
  }
  return { action: 'connect', enabled: true };
}
