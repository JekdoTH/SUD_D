import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AuditEventDto,
  DesktopConnectionSnapshotDto,
  WorkspaceDto,
} from '@sud-d/contracts';
import type { AppPage } from '../App';
import {
  getConnectionPrimaryAction,
  presentConnectionState,
} from '../connection-ui-model';
import { UiIcon } from '../ui-icons';

interface HomePageProps {
  onNavigate: (page: AppPage) => void;
}

function friendlyAction(action: string): string {
  const words = action
    .replaceAll(':', ' ')
    .replaceAll('.', ' ')
    .replaceAll('_', ' ')
    .split(/\s+/u)
    .filter(Boolean);

  if (words.length === 0) return 'Local activity';
  return words
    .map((word, index) => index === 0 ? `${word.charAt(0).toUpperCase()}${word.slice(1)}` : word)
    .join(' ');
}

function formatEventTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function HomePage({ onNavigate }: HomePageProps): React.ReactElement {
  const [workspaces, setWorkspaces] = useState<WorkspaceDto[]>([]);
  const [recentEvents, setRecentEvents] = useState<AuditEventDto[]>([]);
  const [connection, setConnection] = useState<DesktopConnectionSnapshotDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const [workspaceResult, auditResult, connectionResult] = await Promise.all([
      window.sudD.workspace.list(),
      window.sudD.audit.list({ limit: 3 }),
      window.sudD.connection.status(),
    ]);

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
  const visibleWorkspaces = useMemo(
    () => [...workspaces]
      .sort((left, right) => Number(right.isActive) - Number(left.isActive))
      .slice(0, 3),
    [workspaces],
  );
  const statePresentation = connection
    ? presentConnectionState(connection.runtime.state)
    : { label: 'Checking…', description: 'Reading local connection status.', tone: 'neutral' as const };
  const primaryAction = useMemo(
    () => connection ? getConnectionPrimaryAction(connection, Boolean(activeWorkspace)) : null,
    [connection, activeWorkspace],
  );

  const setupRequired = !activeWorkspace
    || !connection?.profile
    || connection.credentialStatus !== 'configured'
    || !connection.profile.tunnelConfigured;

  const connectionHeading = connection === null
    ? 'Checking connection'
    : setupRequired
      ? 'Setup required'
      : statePresentation.label;

  const connectionDescription = connection === null
    ? 'Reading the local connection state for this device.'
    : !activeWorkspace
      ? 'Choose an approved workspace before connecting ChatGPT.'
      : !connection.profile
        ? 'Open Connection to create the local Secure MCP connection profile.'
        : connection.credentialStatus !== 'configured'
          ? 'Add the Runtime API Key required by this device before connecting.'
          : !connection.profile.tunnelConfigured
            ? 'Add Secure Tunnel configuration to finish connection setup.'
            : statePresentation.description;

  const tunnelStatus = !connection?.profile?.tunnelConfigured
    ? 'Not configured'
    : connection.runtime.state === 'error'
      ? 'Error'
      : connection.runtime.state === 'stopped'
        ? 'Ready'
        : 'Running';

  const primaryActionLabel = connection === null
    ? 'Checking…'
    : busy
      ? 'Working…'
    : primaryAction?.action === 'choose_workspace'
      ? 'Choose workspace'
      : primaryAction?.action === 'setup_credential'
        ? 'Set up API Key'
        : primaryAction?.action === 'setup_tunnel'
          ? 'Set up Secure Tunnel'
          : primaryAction?.action === 'disconnect'
            ? 'Disconnect'
            : primaryAction?.action === 'restart'
              ? 'Restart connection'
              : 'Connect ChatGPT';

  const runPrimaryAction = async (): Promise<void> => {
    if (!connection?.profile || !primaryAction?.enabled) {
      if (primaryAction?.action === 'choose_workspace') onNavigate('workspaces');
      else if (!connection?.profile) onNavigate('connection');
      return;
    }

    if (primaryAction.action === 'choose_workspace') {
      onNavigate('workspaces');
      return;
    }
    if (primaryAction.action === 'setup_credential' || primaryAction.action === 'setup_tunnel') {
      onNavigate('connection');
      return;
    }

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
    <div className="overview-page">
      <header className="overview-heading">
        <h1 className="page-title">Overview</h1>
        <p className="page-subtitle">Manage your local ChatGPT connection, workspace, and safety status at a glance.</p>
      </header>

      {error && (
        <div className="callout callout-error" role="alert">
          <strong>Connection needs attention</strong>
          <span>{error}</span>
        </div>
      )}

      <section className="card overview-connection-card" aria-labelledby="overview-connection-title">
        <div className="overview-connection-main">
          <div className={`overview-connection-icon tone-${setupRequired ? 'warning' : statePresentation.tone}`} aria-hidden="true">
            <UiIcon name="connection" size={24} />
          </div>
          <div className="overview-connection-copy">
            <h2 id="overview-connection-title">{connectionHeading}</h2>
            <p>{connectionDescription}</p>
            {primaryAction?.reason && !primaryAction.enabled && (
              <span className="overview-inline-note">{primaryAction.reason}</span>
            )}
          </div>
        </div>

        <dl className="overview-status-list">
          <div>
            <dt>Workspace</dt>
            <dd className={activeWorkspace ? 'status-value-ready' : 'status-value-warning'}>
              {activeWorkspace ? 'Ready' : 'Required'}
            </dd>
          </div>
          <div>
            <dt>Runtime API Key</dt>
            <dd className={connection?.credentialStatus === 'configured' ? 'status-value-ready' : 'status-value-warning'}>
              {connection?.credentialStatus === 'configured' ? 'Configured' : 'Required'}
            </dd>
          </div>
          <div>
            <dt>Secure Tunnel</dt>
            <dd className={tunnelStatus === 'Error' ? 'status-value-error' : tunnelStatus === 'Not configured' ? 'status-value-warning' : 'status-value-ready'}>
              {tunnelStatus}
            </dd>
          </div>
        </dl>

        <div className="overview-primary-actions">
          <button
            id="overview-primary-connection-action"
            className="btn btn-primary overview-primary-button"
            disabled={busy || connection === null || (primaryAction !== null && !primaryAction.enabled && Boolean(connection?.profile))}
            onClick={() => void runPrimaryAction()}
          >
            {primaryActionLabel}
            <UiIcon name="arrow-right" size={16} />
          </button>
          <button className="btn btn-link overview-details-link" onClick={() => onNavigate('connection')}>
            Connection details
          </button>
        </div>
      </section>

      <section className="card overview-section overview-workspaces" aria-labelledby="approved-workspaces-title">
        <div className="overview-section-header">
          <div className="overview-section-title">
            <UiIcon name="workspaces" size={19} />
            <h2 id="approved-workspaces-title">Approved workspaces</h2>
          </div>
          <button className="btn btn-link" onClick={() => onNavigate('workspaces')}>
            {workspaces.length === 0 ? 'Add workspace' : 'View all workspaces'}
            <UiIcon name="arrow-right" size={15} />
          </button>
        </div>

        {visibleWorkspaces.length === 0 ? (
          <div className="overview-empty-row">
            <span>No approved workspace yet.</span>
            <button className="btn btn-ghost" onClick={() => onNavigate('workspaces')}>Choose workspace</button>
          </div>
        ) : (
          <div className="overview-workspace-table" role="table" aria-label="Approved workspaces summary">
            <div className="overview-workspace-header" role="row">
              <span role="columnheader">Path</span>
              <span role="columnheader">Status</span>
            </div>
            {visibleWorkspaces.map((workspace) => (
              <div className="overview-workspace-row" role="row" key={workspace.id}>
                <div className="overview-workspace-path" role="cell">
                  <UiIcon name="workspaces" size={19} />
                  <span title={workspace.canonicalRoot}>{workspace.canonicalRoot}</span>
                </div>
                <div className="overview-workspace-status" role="cell">
                  <span className={`workspace-state-dot${workspace.isActive ? ' active' : ''}`} aria-hidden="true" />
                  <span>{workspace.isActive ? 'Active' : 'Not active'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="overview-bottom-grid">
        <section className="card overview-summary-card" aria-labelledby="recent-activity-title">
          <div className="overview-section-header">
            <div className="overview-section-title">
              <UiIcon name="activity" size={19} />
              <h2 id="recent-activity-title">Recent activity</h2>
            </div>
          </div>

          {recentEvents.length === 0 ? (
            <div className="overview-summary-empty">No local activity yet.</div>
          ) : (
            <div className="overview-activity-list">
              {recentEvents.map((event) => (
                <div className="overview-activity-row" key={event.id}>
                  <span className={`activity-state-icon ${event.resultCode === 'OK' ? 'success' : 'error'}`} aria-hidden="true">
                    <UiIcon name="check" size={16} />
                  </span>
                  <div className="overview-activity-copy">
                    <strong>{friendlyAction(event.action)}</strong>
                    {event.resourcePath && <span title={event.resourcePath}>{event.resourcePath}</span>}
                  </div>
                  <time dateTime={event.timestamp}>{formatEventTime(event.timestamp)}</time>
                </div>
              ))}
            </div>
          )}

          <button className="btn btn-link overview-card-link" onClick={() => onNavigate('activity')}>
            View all activity
            <UiIcon name="arrow-right" size={15} />
          </button>
        </section>

        <section className="card overview-summary-card" aria-labelledby="safety-status-title">
          <div className="overview-section-header">
            <div className="overview-section-title">
              <UiIcon name="security" size={19} />
              <h2 id="safety-status-title">Safety status</h2>
            </div>
          </div>

          <ul className="overview-safety-list">
            <li>
              <UiIcon name="check" size={18} />
              <span>Workspace-bound access</span>
            </li>
            <li>
              <UiIcon name="check" size={18} />
              <span>Network denied by default</span>
            </li>
            <li>
              <UiIcon name="check" size={18} />
              <span>Credentials stay hidden from the renderer</span>
            </li>
          </ul>

          <button className="btn btn-link overview-card-link" onClick={() => onNavigate('security')}>
            View security
            <UiIcon name="arrow-right" size={15} />
          </button>
        </section>
      </div>
    </div>
  );
}
