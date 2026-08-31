import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AuditEventDto,
  DesktopConnectionSnapshotDto,
  WorkspaceDto,
} from '@sud-d/contracts';
import type { AppPage } from '../App';
import {
  deriveConnectionComponentStatuses,
  getConnectionPrimaryAction,
  presentConnectionState,
} from '../connection-ui-model';

interface HomePageProps {
  onNavigate: (page: AppPage) => void;
}

function friendlyAction(action: string): string {
  return action
    .replaceAll(':', ' · ')
    .replaceAll('.', ' · ')
    .replaceAll('_', ' ');
}

export function HomePage({ onNavigate }: HomePageProps): React.ReactElement {
  const [workspaces, setWorkspaces] = useState<WorkspaceDto[]>([]);
  const [recentEvents, setRecentEvents] = useState<AuditEventDto[]>([]);
  const [connection, setConnection] = useState<DesktopConnectionSnapshotDto | null>(null);
  const [version, setVersion] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const [healthResult, workspaceResult, auditResult, connectionResult] = await Promise.all([
      window.sudD.health.check(),
      window.sudD.workspace.list(),
      window.sudD.audit.list({ limit: 5 }),
      window.sudD.connection.status(),
    ]);

    if (healthResult.ok) setVersion(healthResult.value.version);
    if (workspaceResult.ok) setWorkspaces(workspaceResult.value);
    if (auditResult.ok) setRecentEvents(auditResult.value);
    if (connectionResult.ok) {
      setConnection(connectionResult.value);
      setError('');
    } else {
      setError(connectionResult.error.message);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const activeWorkspace = workspaces.find((workspace) => workspace.isActive);
  const statePresentation = connection
    ? presentConnectionState(connection.runtime.state)
    : { label: 'Checking…', description: 'Reading local connection status.', tone: 'neutral' as const };
  const componentStatuses = connection
    ? deriveConnectionComponentStatuses(connection.runtime.state)
    : { gateway: 'stopped' as const, tunnel: 'stopped' as const, client: 'disconnected' as const };
  const primaryAction = useMemo(
    () => connection ? getConnectionPrimaryAction(connection, Boolean(activeWorkspace)) : null,
    [connection, activeWorkspace],
  );
  const needsTunnelSetup = Boolean(
    connection?.profile &&
    connection.credentialStatus === 'configured' &&
    !connection.profile.tunnelConfigured &&
    connection.runtime.state === 'stopped',
  );

  const runPrimaryAction = async (): Promise<void> => {
    if (!connection?.profile || !primaryAction?.enabled) return;
    setBusy(true);
    setError('');
    const result = primaryAction.action === 'connect'
      ? await window.sudD.connection.start({ profileId: connection.profile.profileId })
      : primaryAction.action === 'restart'
        ? await window.sudD.connection.restart({ profileId: connection.profile.profileId })
        : await window.sudD.connection.stop({});
    setBusy(false);
    if (result.ok) setConnection(result.value);
    else setError(result.error.message);
    await refresh();
  };

  return (
    <>
      <div className="page-header page-header-row">
        <div>
          <h1 className="page-title">Overview</h1>
          <p className="page-subtitle">Your local ChatGPT connection, workspace, and safety status at a glance.</p>
        </div>
        <div className={`status-chip tone-${statePresentation.tone}`}>
          <span className="status-dot" />
          {statePresentation.label}
        </div>
      </div>

      {error && (
        <div className="callout callout-error" role="alert">
          <strong>Connection needs attention</strong>
          <span>{error}</span>
        </div>
      )}

      <div className="overview-grid">
        <section className="card overview-card">
          <div className="card-kicker">This Device</div>
          <div className="card-heading">{connection?.profile?.deviceName ?? 'This Device'}</div>
          <div className="muted">Windows · Local-first</div>
          <div className="card-footer-line">
            <span className={`status-chip compact tone-${statePresentation.tone}`}>{statePresentation.label}</span>
            {version && <span className="muted">SUD-D v{version}</span>}
          </div>
        </section>

        <section className="card overview-card span-2">
          <div className="card-header-row">
            <div>
              <div className="card-kicker">Connection</div>
              <div className="card-heading">ChatGPT</div>
              <div className="muted">OpenAI Secure MCP Tunnel · stdio</div>
            </div>
            <div className={`status-chip tone-${statePresentation.tone}`}>{statePresentation.label}</div>
          </div>
          <p className="card-description">{statePresentation.description}</p>
          <div className="component-strip">
            <span>Gateway <strong>{componentStatuses.gateway}</strong></span>
            <span>Tunnel <strong>{componentStatuses.tunnel}</strong></span>
            <span>ChatGPT <strong>{componentStatuses.client}</strong></span>
          </div>
          <div className="button-row">
            <button
              id="overview-primary-connection-action"
              className="btn btn-primary"
              disabled={busy || (!needsTunnelSetup && !primaryAction?.enabled)}
              onClick={() => needsTunnelSetup ? onNavigate('connection') : void runPrimaryAction()}
            >
              {busy
                ? 'Working…'
                : needsTunnelSetup
                  ? 'Set up Secure Tunnel'
                  : primaryAction?.action === 'disconnect'
                    ? 'Disconnect'
                    : primaryAction?.action === 'restart'
                      ? 'Restart'
                      : 'Connect ChatGPT'}
            </button>
            <button className="btn btn-ghost" onClick={() => onNavigate('connection')}>Connection details</button>
          </div>
          {!primaryAction?.enabled && primaryAction?.reason && (
            <div className="inline-hint">{primaryAction.reason}</div>
          )}
        </section>

        <section className="card overview-card span-2">
          <div className="card-header-row">
            <div>
              <div className="card-kicker">Active Workspace</div>
              <div className="card-heading">{activeWorkspace?.displayName ?? 'No workspace selected'}</div>
            </div>
            {activeWorkspace && <span className="badge badge-green">Active</span>}
          </div>
          {activeWorkspace ? (
            <div className="workspace-path">{activeWorkspace.canonicalRoot}</div>
          ) : (
            <p className="card-description">Select a workspace before connecting ChatGPT.</p>
          )}
          <button className="btn btn-ghost" onClick={() => onNavigate('workspaces')}>
            {activeWorkspace ? 'Change workspace' : 'Choose workspace'}
          </button>
        </section>

        <section className="card overview-card">
          <div className="card-kicker">Pending Approval</div>
          <div className="metric">0</div>
          <p className="muted">Approval workflow is not enabled yet.</p>
          <span className="badge badge-gray">Coming later</span>
        </section>

        <section className="card overview-card span-2">
          <div className="card-header-row">
            <div>
              <div className="card-kicker">Security Summary</div>
              <div className="card-heading">Safe defaults</div>
            </div>
            <button className="btn btn-link" onClick={() => onNavigate('security')}>View security</button>
          </div>
          <div className="security-grid compact-security-grid">
            <div className="security-item"><span>Read</span><span className="badge badge-green">Allow</span></div>
            <div className="security-item"><span>Write</span><span className="badge badge-green">Allow</span></div>
            <div className="security-item"><span>Delete</span><span className="badge badge-yellow">Ask</span></div>
            <div className="security-item"><span>Execute</span><span className="badge badge-yellow">Ask</span></div>
            <div className="security-item"><span>Network</span><span className="badge badge-red">Deny</span></div>
          </div>
          <p className="fine-print">Displayed from the approved baseline policy. Enforcement remains in backend security boundaries.</p>
        </section>

        <section className="card overview-card span-2">
          <div className="card-header-row">
            <div>
              <div className="card-kicker">Recent Activity</div>
              <div className="card-heading">Latest local events</div>
            </div>
            <button className="btn btn-link" onClick={() => onNavigate('activity')}>View all</button>
          </div>
          {recentEvents.length === 0 ? (
            <div className="empty-compact">No activity yet.</div>
          ) : (
            <div className="activity-list">
              {recentEvents.map((event) => (
                <div className="activity-row" key={event.id}>
                  <div>
                    <strong>{friendlyAction(event.action)}</strong>
                    <div className="muted small">{new Date(event.timestamp).toLocaleString()}</div>
                  </div>
                  <span className={`badge ${event.resultCode === 'OK' ? 'badge-green' : 'badge-red'}`}>
                    {event.resultCode}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card overview-card">
          <div className="card-kicker">Recovery</div>
          <div className="card-heading">Protected changes</div>
          <p className="muted">Recovery engine is not enabled in M0.6.</p>
          <button className="btn btn-ghost" onClick={() => onNavigate('recovery')}>Learn more</button>
        </section>
      </div>
    </>
  );
}
