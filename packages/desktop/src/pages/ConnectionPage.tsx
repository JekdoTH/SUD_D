import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ApprovalModeDto, DesktopConnectionSnapshotDto, WorkspaceDto } from '@sud-d/contracts';
import type { AppPage } from '../App';
import {
  canRestartConnection,
  deriveConnectionComponentStatuses,
  getConnectionPrimaryAction,
  presentConnectionState,
} from '../connection-ui-model';
import { UiIcon } from '../ui-icons';

interface ConnectionPageProps {
  onNavigate: (page: AppPage) => void;
}

const APPROVAL_MODE_OPTIONS: ReadonlyArray<{
  mode: ApprovalModeDto;
  label: string;
  description: string;
}> = [
  { mode: 'standard', label: 'Standard', description: 'Ask before protected actions.' },
  { mode: 'approve_for_me', label: 'Approve for me', description: 'Automate bounded local verification while keeping sensitive actions manual.' },
  { mode: 'full_access', label: 'Full Access', description: 'Maximize safe local automation without bypassing SUD-D hard boundaries.' },
];

function componentTone(state: string): string {
  if (state === 'ready' || state === 'connected') return 'badge-green';
  if (state === 'starting') return 'badge-yellow';
  if (state === 'error') return 'badge-red';
  return 'badge-gray';
}

function errorGuidance(code: string): string {
  switch (code) {
    case 'CONNECTION_CREDENTIAL_MISSING':
      return 'Runtime API Key is missing on this device.';
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

function tunnelStatus(snapshot: DesktopConnectionSnapshotDto | null): { label: string; badge: string } {
  if (!snapshot?.profile?.tunnelConfigured) return { label: 'Needs setup', badge: 'badge-yellow' };
  if (snapshot.runtime.state === 'error') return { label: 'Error', badge: 'badge-red' };
  if (snapshot.runtime.state === 'stopped') return { label: 'Ready', badge: 'badge-green' };
  return { label: 'Running', badge: 'badge-green' };
}

function validTunnelReference(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 8 && trimmed.length <= 500 && /^tunnel_[A-Za-z0-9_-]+$/.test(trimmed);
}

export function ConnectionPage({ onNavigate }: ConnectionPageProps): React.ReactElement {
  const [snapshot, setSnapshot] = useState<DesktopConnectionSnapshotDto | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tunnelReference, setTunnelReference] = useState('');
  const [editingTunnel, setEditingTunnel] = useState(false);
  const [approvalMode, setApprovalMode] = useState<ApprovalModeDto>('approve_for_me');
  const [modeSaving, setModeSaving] = useState(false);
  const [approvalModeError, setApprovalModeError] = useState('');

  const refresh = useCallback(async () => {
    const [connectionResult, workspaceResult, modeResult] = await Promise.all([
      window.sudD.connection.status(),
      window.sudD.workspace.list(),
      window.sudD.approval.getMode(),
    ]);
    if (connectionResult.ok) {
      setSnapshot(connectionResult.value);
      setError('');
    } else {
      setError(connectionResult.error.message);
    }
    if (workspaceResult.ok) setWorkspaces(workspaceResult.value);
    if (modeResult.ok) {
      setApprovalMode(modeResult.value.mode);
      setApprovalModeError('');
    } else {
      setApprovalModeError(modeResult.error.message);
    }
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
  const secureTunnelStatus = tunnelStatus(snapshot);
  const tunnelInputValid = validTunnelReference(tunnelReference);

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

  const setupRuntimeKey = async (): Promise<void> => {
    if (!snapshot?.profile) return;
    setBusy(true);
    setError('');
    const result = await window.sudD.connection.setupCredential({
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

  const removeRuntimeKey = async (): Promise<void> => {
    if (!snapshot?.profile) return;
    setBusy(true);
    setError('');
    const result = await window.sudD.connection.removeCredential({
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

  const setupSecureTunnel = async (): Promise<void> => {
    if (!snapshot?.profile) return;
    const candidate = tunnelReference.trim();
    if (!validTunnelReference(candidate)) {
      setError('Enter a valid Tunnel ID beginning with tunnel_.');
      return;
    }

    setBusy(true);
    setError('');
    const result = await window.sudD.connection.configureTunnel({
      profileId: snapshot.profile.profileId,
      tunnelReference: candidate,
    });
    setBusy(false);
    if (result.ok) {
      setSnapshot(result.value);
      setTunnelReference('');
      setEditingTunnel(false);
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

  const runPrimaryAction = async (): Promise<void> => {
    if (!primaryAction?.enabled) return;
    switch (primaryAction.action) {
      case 'choose_workspace':
        onNavigate('workspaces');
        return;
      case 'setup_credential':
        await setupRuntimeKey();
        return;
      case 'setup_tunnel':
        await setupSecureTunnel();
        return;
      case 'connect':
      case 'disconnect':
      case 'restart':
        await performLifecycle(primaryAction.action);
    }
  };

  const openOpenAiApiKeysPage = async (): Promise<void> => {
    setError('');
    try {
      const result = await window.sudD.app.openOpenAiApiKeysPage();
      if (!result.ok) setError(result.error.message);
    } catch {
      setError('Failed to open OpenAI API Keys page');
    }
  };

  const openOpenAiTunnelSettingsPage = async (): Promise<void> => {
    setError('');
    try {
      const result = await window.sudD.app.openOpenAiTunnelSettingsPage();
      if (!result.ok) setError(result.error.message);
    } catch {
      setError('Failed to open OpenAI Tunnel Settings page');
    }
  };

  const changeApprovalMode = useCallback(async (mode: ApprovalModeDto) => {
    if (modeSaving || mode === approvalMode) return;
    setModeSaving(true);
    setApprovalModeError('');
    const result = await window.sudD.approval.setMode({ mode });
    setModeSaving(false);
    if (!result.ok) {
      setApprovalModeError(result.error.message);
      return;
    }
    setApprovalMode(result.value.mode);
  }, [approvalMode, modeSaving]);

  const runtimeError = snapshot?.runtime.error;
  const primaryLabel = primaryAction?.action === 'choose_workspace'
    ? 'Choose Workspace'
    : primaryAction?.action === 'setup_credential'
      ? 'Set up API Key'
      : primaryAction?.action === 'setup_tunnel'
        ? 'Set up Secure Tunnel'
        : primaryAction?.action === 'disconnect'
          ? 'Disconnect'
          : primaryAction?.action === 'restart'
            ? 'Restart connection'
            : 'Connect ChatGPT';

  return (
    <>
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
            <span className={`badge ${secureTunnelStatus.badge}`}>{secureTunnelStatus.label}</span>
          </div>
          <div className="component-card">
            <span className="component-label">ChatGPT</span>
            <span className={`badge ${componentTone(components.client)}`}>{presentation.label}</span>
          </div>
        </div>

        {primaryAction?.action === 'setup_tunnel' && (
          <div className="setup-form" aria-label="Secure Tunnel setup">
            <label htmlFor="connection-tunnel-id"><strong>Tunnel ID</strong></label>
            <input
              id="connection-tunnel-id"
              className="input"
              value={tunnelReference}
              onChange={(event) => setTunnelReference(event.target.value)}
              placeholder="tunnel_..."
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
            />
            <p className="fine-print">Paste only the OpenAI Secure MCP Tunnel ID. It is stored locally as non-secret connection configuration.</p>
          </div>
        )}

        <div className="button-row">
          <button
            id="connection-primary-action"
            className="btn btn-primary"
            disabled={busy || !primaryAction?.enabled || (primaryAction.action === 'setup_tunnel' && !tunnelInputValid)}
            onClick={() => void runPrimaryAction()}
          >
            {busy ? 'Working…' : primaryLabel}
          </button>
          {snapshot && canRestartConnection(snapshot.runtime.state) && primaryAction?.action !== 'restart' && (
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

      <div className="setup-grid">
        <section className="card setup-card">
          <div className="card-kicker">Workspace</div>
          <div className="setup-status-line">
            <div className="card-heading">{activeWorkspace?.displayName ?? 'Workspace required'}</div>
            <span className={`badge ${activeWorkspace ? 'badge-green' : 'badge-yellow'}`}>
              {activeWorkspace ? 'Ready' : 'Needs setup'}
            </span>
          </div>
          {activeWorkspace ? (
            <div className="workspace-path">{activeWorkspace.canonicalRoot}</div>
          ) : (
            <p className="card-description">Choose the workspace ChatGPT is allowed to use.</p>
          )}
          <button className="btn btn-ghost" onClick={() => onNavigate('workspaces')}>
            {activeWorkspace ? 'Change workspace' : 'Choose workspace'}
          </button>
          {snapshot?.runtime.session && (
            <p className="fine-print">Disconnect before changing the workspace bound to the current session.</p>
          )}
        </section>

        <section className="card setup-card">
          <div className="card-kicker">Runtime API Key</div>
          <div className="setup-status-line">
            <div className="card-heading">Secure credential</div>
            <span className={`badge ${snapshot?.credentialStatus === 'configured' ? 'badge-green' : 'badge-yellow'}`}>
              {snapshot?.credentialStatus === 'configured' ? 'Configured' : 'Missing'}
            </span>
          </div>
          <p className="card-description">The API Key is managed through the Windows-native secure prompt and is never displayed here.</p>
          {snapshot?.profile && snapshot.credentialStatus === 'configured' && (
            <div className="button-row setup-card-action-row">
              <button
                id="connection-credential-setup"
                className="btn btn-ghost"
                disabled={busy || snapshot.runtime.state !== 'stopped'}
                onClick={() => void setupRuntimeKey()}
              >
                Replace API Key
              </button>
              <button
                id="connection-credential-remove"
                className="btn btn-ghost"
                disabled={busy || snapshot.runtime.state !== 'stopped'}
                onClick={() => void removeRuntimeKey()}
              >
                Remove API Key
              </button>
            </div>
          )}
          <button
            className="btn btn-link setup-external-link-row"
            onClick={() => void openOpenAiApiKeysPage()}
          >
            <UiIcon name="external-link" size={15} />
            Get API Key from OpenAI
          </button>
          {snapshot?.profile && snapshot.runtime.state !== 'stopped' && (
            <p className="fine-print">Disconnect ChatGPT before changing the Runtime API Key.</p>
          )}
        </section>

        <section className="card setup-card">
          <div className="card-kicker">Secure Tunnel</div>
          <div className="setup-status-line">
            <div className="card-heading">OpenAI Secure MCP Tunnel</div>
            <span className={`badge ${secureTunnelStatus.badge}`}>{secureTunnelStatus.label}</span>
          </div>
          <p className="card-description">
            {snapshot?.profile?.tunnelConfigured
              ? 'Secure Tunnel is ready.'
              : 'Enter the Tunnel ID in the primary setup step above.'}
          </p>
          {snapshot?.profile?.tunnelConfigured && (
            <>
              <button
                className="btn btn-ghost"
                disabled={busy || snapshot.runtime.state !== 'stopped'}
                onClick={() => setEditingTunnel((current) => !current)}
              >
                Change Tunnel configuration
              </button>
              <button
                className="btn btn-link setup-external-link-row"
                onClick={() => void openOpenAiTunnelSettingsPage()}
              >
                <UiIcon name="external-link" size={15} />
                Open Tunnel Settings
              </button>
              {snapshot.runtime.state !== 'stopped' && (
                <p className="fine-print">Disconnect ChatGPT before changing Secure Tunnel configuration.</p>
              )}
              {editingTunnel && snapshot.runtime.state === 'stopped' && (
                <div className="setup-form compact-setup-form">
                  <label htmlFor="connection-tunnel-id-change"><strong>Tunnel ID</strong></label>
                  <input
                    id="connection-tunnel-id-change"
                    className="input"
                    value={tunnelReference}
                    onChange={(event) => setTunnelReference(event.target.value)}
                    placeholder="tunnel_..."
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    className="btn btn-ghost"
                    disabled={busy || !tunnelInputValid}
                    onClick={() => void setupSecureTunnel()}
                  >
                    Save Tunnel ID
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      <section className="card approval-mode-card" aria-labelledby="default-approval-mode-title">
        <div className="approval-mode-copy">
          <div id="default-approval-mode-title" className="card-heading">Default Approval Mode</div>
          <p className="card-description">Choose the default approval behavior shared by all approved workspaces on this device. Policy hard boundaries always stay enforced.</p>
        </div>
        {approvalModeError && <div className="callout callout-error" role="alert">{approvalModeError}</div>}
        <div className="approval-mode-options" role="radiogroup" aria-label="Default Approval Mode">
          {APPROVAL_MODE_OPTIONS.map((option) => (
            <button
              key={option.mode}
              type="button"
              className={`approval-mode-option${approvalMode === option.mode ? ' is-selected' : ''}`}
              role="radio"
              aria-checked={approvalMode === option.mode}
              disabled={modeSaving}
              onClick={() => void changeApprovalMode(option.mode)}
            >
              <strong>{option.label}</strong>
              <span>{option.description}</span>
            </button>
          ))}
        </div>
      </section>

      <details className="card advanced-card">
        <summary>Advanced details</summary>
        <div className="advanced-content">
          <p className="muted">
            Normal use does not require command-line configuration. These details expose only safe connection metadata.
          </p>
          <dl className="detail-list">
            <div><dt>Device</dt><dd>{snapshot?.profile?.deviceName ?? 'This Device'}</dd></div>
            <div><dt>Provider</dt><dd>OpenAI Secure MCP Tunnel</dd></div>
            <div><dt>Transport</dt><dd>stdio</dd></div>
            <div><dt>Runtime state</dt><dd>{snapshot?.runtime.state ?? 'checking'}</dd></div>
            <div><dt>Gateway</dt><dd>{components.gateway}</dd></div>
            {runtimeError && <div><dt>Error code</dt><dd>{runtimeError.code}</dd></div>}
          </dl>

          {snapshot?.profile && (
            <div className="preference-list" aria-label="Connection preferences">
              <label className="preference-row">
                <span>
                  <strong>Auto-start preference</strong>
                  <small>Saved preference only. Automatic startup is not activated yet.</small>
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
                  <small>Saved preference only. Automatic restart is not activated yet.</small>
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
