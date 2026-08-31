import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { DesktopConnectionSnapshotDto, WorkspaceDto } from '@sud-d/contracts';
import {
  canRestartConnection,
  deriveConnectionComponentStatuses,
  getConnectionPrimaryAction,
  presentConnectionState,
} from '../connection-ui-model';

function componentTone(state: string): string {
  if (state === 'ready' || state === 'connected') return 'badge-green';
  if (state === 'starting') return 'badge-yellow';
  if (state === 'error') return 'badge-red';
  return 'badge-gray';
}

function errorGuidance(code: string): string {
  switch (code) {
    case 'CONNECTION_CREDENTIAL_MISSING':
      return 'Secure Tunnel credential is missing on this device.';
    case 'CONNECTION_WORKSPACE_NOT_SELECTED':
      return 'Select an active workspace before connecting ChatGPT.';
    case 'TUNNEL_CLIENT_NOT_FOUND':
      return 'OpenAI Secure Tunnel is not available on this device.';
    case 'TUNNEL_HEALTH_FAILED':
    case 'TUNNEL_START_FAILED':
    case 'TUNNEL_EXITED_UNEXPECTEDLY':
      return 'Secure Tunnel could not establish a healthy connection. Retry after checking Environment / Doctor.';
    case 'CONNECTION_WORKSPACE_REBIND_REQUIRES_RESTART':
      return 'Disconnect before changing the active workspace.';
    default:
      return 'Connection could not continue. Retry or review the safe technical details below.';
  }
}

export function ConnectionPage(): React.ReactElement {
  const [snapshot, setSnapshot] = useState<DesktopConnectionSnapshotDto | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const [connectionResult, workspaceResult] = await Promise.all([
      window.sudD.connection.status(),
      window.sudD.workspace.list(),
    ]);
    if (connectionResult.ok) {
      setSnapshot(connectionResult.value);
      setError('');
    } else {
      setError(connectionResult.error.message);
    }
    if (workspaceResult.ok) setWorkspaces(workspaceResult.value);
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const activeWorkspace = workspaces.find((workspace) => workspace.isActive);
  const presentation = snapshot
    ? presentConnectionState(snapshot.runtime.state)
    : { label: 'Checking…', description: 'Reading local connection status.', tone: 'neutral' as const };
  const components = snapshot
    ? deriveConnectionComponentStatuses(snapshot.runtime.state)
    : { gateway: 'stopped' as const, tunnel: 'stopped' as const, client: 'disconnected' as const };
  const primaryAction = useMemo(
    () => snapshot ? getConnectionPrimaryAction(snapshot, Boolean(activeWorkspace)) : null,
    [snapshot, activeWorkspace],
  );

  const performLifecycle = async (action: 'connect' | 'disconnect' | 'restart'): Promise<void> => {
    if (!snapshot?.profile) return;
    setBusy(true);
    setError('');
    const result = action === 'connect'
      ? await window.sudD.connection.start({ profileId: snapshot.profile.profileId })
      : action === 'restart'
        ? await window.sudD.connection.restart({ profileId: snapshot.profile.profileId })
        : await window.sudD.connection.stop({});
    setBusy(false);
    if (result.ok) setSnapshot(result.value);
    else setError(result.error.message);
    await refresh();
  };

  const runPrimaryAction = async (): Promise<void> => {
    if (!primaryAction?.enabled) return;
    await performLifecycle(primaryAction.action);
  };

  const setupSecureTunnel = async (): Promise<void> => {
    if (!snapshot?.profile) return;
    setBusy(true);
    setError('');
    const result = await window.sudD.connection.configureTunnel({
      profileId: snapshot.profile.profileId,
    });
    setBusy(false);
    if (result.ok) {
      setSnapshot(result.value);
      await refresh();
    } else {
      setError(result.error.message);
    }
  };

  const updatePreferences = async (autoStart: boolean, autoRestart: boolean): Promise<void> => {
    if (!snapshot?.profile) return;
    setBusy(true);
    setError('');
    const result = await window.sudD.connection.updatePreferences({
      profileId: snapshot.profile.profileId,
      autoStart,
      autoRestart,
    });
    setBusy(false);
    if (result.ok) setSnapshot(result.value);
    else setError(result.error.message);
  };

  const runtimeError = snapshot?.runtime.error;

  return (
    <>
      <div className="page-header page-header-row">
        <div>
          <h1 className="page-title">Connection</h1>
          <p className="page-subtitle">Connect ChatGPT without managing command-line details.</p>
        </div>
        <div className={`status-chip tone-${presentation.tone}`}>
          <span className="status-dot" />
          {presentation.label}
        </div>
      </div>

      {(error || runtimeError) && (
        <div className="callout callout-error" role="alert">
          <strong>{runtimeError ? errorGuidance(runtimeError.code) : 'Connection needs attention'}</strong>
          <span>{runtimeError?.message ?? error}</span>
        </div>
      )}

      <section className="card connection-hero">
        <div className="card-header-row">
          <div>
            <div className="card-kicker">ChatGPT Connection</div>
            <div className="card-heading">OpenAI Secure MCP Tunnel</div>
            <div className="muted">Transport: stdio</div>
          </div>
          <div className={`status-chip tone-${presentation.tone}`}>{presentation.label}</div>
        </div>
        <p className="card-description">{presentation.description}</p>

        <div className="component-grid">
          <div className="component-card">
            <span className="component-label">MCP Gateway</span>
            <span className={`badge ${componentTone(components.gateway)}`}>{components.gateway}</span>
          </div>
          <div className="component-card">
            <span className="component-label">Secure Tunnel</span>
            <span className={`badge ${componentTone(components.tunnel)}`}>{components.tunnel}</span>
          </div>
          <div className="component-card">
            <span className="component-label">ChatGPT</span>
            <span className={`badge ${componentTone(components.client)}`}>{components.client}</span>
          </div>
        </div>

        <div className="button-row">
          <button
            id="connection-primary-action"
            className="btn btn-primary"
            disabled={busy || !primaryAction?.enabled}
            onClick={() => void runPrimaryAction()}
          >
            {busy
              ? 'Working…'
              : primaryAction?.action === 'disconnect'
                ? 'Disconnect'
                : primaryAction?.action === 'restart'
                  ? 'Restart connection'
                  : 'Connect ChatGPT'}
          </button>
          {snapshot && canRestartConnection(snapshot.runtime.state) && (
            <button
              className="btn btn-ghost"
              disabled={busy || !snapshot.profile}
              onClick={() => void performLifecycle('restart')}
            >
              Restart
            </button>
          )}
        </div>
        {!primaryAction?.enabled && primaryAction?.reason && (
          <div className="inline-hint">{primaryAction.reason}</div>
        )}
      </section>

      <div className="two-column-grid">
        <section className="card">
          <div className="card-kicker">This Device</div>
          <div className="card-heading">{snapshot?.profile?.deviceName ?? 'This Device'}</div>
          <dl className="detail-list">
            <div><dt>Profile</dt><dd>{snapshot?.profile?.displayName ?? 'Preparing local profile…'}</dd></div>
            <div><dt>Provider</dt><dd>OpenAI Secure MCP Tunnel</dd></div>
            <div><dt>Transport</dt><dd>stdio</dd></div>
            <div>
              <dt>Credential</dt>
              <dd>
                <span className={`badge ${snapshot?.credentialStatus === 'configured' ? 'badge-green' : 'badge-yellow'}`}>
                  {snapshot?.credentialStatus === 'configured' ? 'Configured' : 'Missing'}
                </span>
              </dd>
            </div>
            <div>
              <dt>Tunnel setup</dt>
              <dd>
                <span className={`badge ${snapshot?.profile?.tunnelConfigured ? 'badge-green' : 'badge-yellow'}`}>
                  {snapshot?.profile?.tunnelConfigured ? 'Configured' : 'Missing'}
                </span>
              </dd>
            </div>
          </dl>
          {snapshot?.profile && !snapshot.profile.tunnelConfigured && snapshot.credentialStatus === 'configured' && (
            <div className="advanced-setup">
              <p className="card-description">SUD-D found the tunnel configuration on this device. Set it up once to connect ChatGPT.</p>
              <button
                id="connection-tunnel-setup"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void setupSecureTunnel()}
              >
                {busy ? 'Working…' : 'Set up Secure Tunnel'}
              </button>
            </div>
          )}
          {snapshot?.profile?.tunnelConfigured && (
            <p className="fine-print">Secure Tunnel is ready.</p>
          )}
        </section>

        <section className="card">
          <div className="card-kicker">Workspace Boundary</div>
          <div className="card-heading">{activeWorkspace?.displayName ?? 'Workspace required'}</div>
          {activeWorkspace ? (
            <div className="workspace-path">{activeWorkspace.canonicalRoot}</div>
          ) : (
            <p className="card-description">Select an active workspace before connecting. The selected workspace remains the authorization boundary.</p>
          )}
          {snapshot?.runtime.session && (
            <p className="fine-print">The current connection is bound to its existing workspace session until disconnected or restarted.</p>
          )}
        </section>
      </div>

      <details className="card advanced-card">
        <summary>Advanced details</summary>
        <div className="advanced-content">
          <p className="muted">
            Normal use does not require command-line configuration. These details expose only safe connection metadata.
          </p>
          <dl className="detail-list">
            <div><dt>Runtime state</dt><dd>{snapshot?.runtime.state ?? 'checking'}</dd></div>
            {runtimeError && <div><dt>Error code</dt><dd>{runtimeError.code}</dd></div>}
          </dl>

          {snapshot?.profile && (
            <div className="preference-list" aria-label="Connection preferences">
              <label className="preference-row">
                <span>
                  <strong>Auto-start preference</strong>
                  <small>Saved preference only. Automatic startup is not activated by M0.6.</small>
                </span>
                <input
                  type="checkbox"
                  checked={snapshot.profile.autoStart}
                  disabled={busy}
                  onChange={(event) => void updatePreferences(
                    event.target.checked,
                    snapshot.profile?.autoRestart ?? false,
                  )}
                />
              </label>
              <label className="preference-row">
                <span>
                  <strong>Auto-restart preference</strong>
                  <small>Saved preference only. Automatic restart is not activated by M0.6.</small>
                </span>
                <input
                  type="checkbox"
                  checked={snapshot.profile.autoRestart}
                  disabled={busy}
                  onChange={(event) => void updatePreferences(
                    snapshot.profile?.autoStart ?? false,
                    event.target.checked,
                  )}
                />
              </label>
            </div>
          )}

        </div>
      </details>
    </>
  );
}
