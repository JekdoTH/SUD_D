import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  DesktopActivityEventDto,
  DesktopConnectionSnapshotDto,
  DesktopOverviewWorkStatusDto,
  WorkspaceDto,
} from '@sud-d/contracts';
import type { AppPage } from '../App';
import {
  getConnectionPrimaryAction,
  presentConnectionState,
} from '../connection-ui-model';
import { UiIcon } from '../ui-icons';
import { presentCurrentActivityStatus } from '../current-activity-ui-model';

interface HomePageProps {
  onNavigate: (page: AppPage) => void;
}

function formatEventTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatResultCode(resultCode: string): string {
  if (resultCode === 'OK') return 'OK';
  return resultCode
    .toLowerCase()
    .replace(/[_:.]+/gu, ' ')
    .replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

export function HomePage({ onNavigate }: HomePageProps): React.ReactElement {
  const [workspaces, setWorkspaces] = useState<WorkspaceDto[]>([]);
  const [recentEvents, setRecentEvents] = useState<DesktopActivityEventDto[]>([]);
  const [connection, setConnection] = useState<DesktopConnectionSnapshotDto | null>(null);
  const [workStatus, setWorkStatus] = useState<DesktopOverviewWorkStatusDto | null>(null);
  const [workStatusAvailable, setWorkStatusAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const workStatusRefreshInFlight = useRef(false);

  const refresh = useCallback(async () => {
    const [workspaceResult, activityResult, connectionResult] = await Promise.all([
      window.sudD.workspace.list(),
      window.sudD.activity.list({ limit: 5 }),
      window.sudD.connection.status(),
    ]);

    if (workspaceResult.ok) setWorkspaces(workspaceResult.value);
    if (activityResult.ok) setRecentEvents(activityResult.value);
    if (connectionResult.ok) {
      setConnection(connectionResult.value);
      setError('');
    } else {
      setError(connectionResult.error.message);
    }
  }, []);

  const refreshWorkStatus = useCallback(async () => {
    if (workStatusRefreshInFlight.current) return;
    workStatusRefreshInFlight.current = true;
    try {
      const result = await window.sudD.overview.workStatus();
      setWorkStatusAvailable(result.ok);
      setWorkStatus(result.ok ? result.value : null);
    } finally {
      workStatusRefreshInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    void refreshWorkStatus();
    const timer = window.setInterval(() => void refreshWorkStatus(), 5000);
    return () => window.clearInterval(timer);
  }, [refreshWorkStatus]);

  const activeWorkspace = workspaces.find((workspace) => workspace.isActive);
  const visibleWorkspaces = activeWorkspace ? [activeWorkspace] : [];
  const currentWorkStatus = activeWorkspace && workStatus?.workspaceId === activeWorkspace.id
    ? workStatus
    : null;
  const workStatusChecking = Boolean(activeWorkspace)
    && workStatusAvailable !== false
    && currentWorkStatus === null;
  const teamStatus = currentWorkStatus?.team;
  const teamMission = teamStatus?.availability === 'available' ? teamStatus.mission : null;
  const approvalStatus = currentWorkStatus?.approval.availability === 'available'
    ? currentWorkStatus.approval
    : null;
  const checkpoint = currentWorkStatus?.checkpoint;
  const latestActivity = currentWorkStatus?.latestActivity;

  const currentActivityStatus = presentCurrentActivityStatus({
    hasActiveWorkspace: Boolean(activeWorkspace),
    workStatusAvailable,
    workStatusChecking,
    teamStatusAvailable: teamStatus
      ? teamStatus.availability === 'available'
      : null,
    teamState: teamMission?.state ?? null,
    pendingApprovalCount: approvalStatus?.pendingCount ?? 0,
    pendingTeamStart: approvalStatus?.pendingTeamStart ?? false,
    checkpointState: checkpoint?.availability === 'available'
      ? checkpoint.taskStatus
      : checkpoint?.availability ?? 'none',
  });
  const activityModeLabel = currentActivityStatus.modeLabel;
  const activityStateLabel = currentActivityStatus.stateLabel;
  const activityBadgeClass = currentActivityStatus.badgeClass;

  const currentActivityTask = !activeWorkspace
    ? 'Choose an approved Workspace to read current activity.'
    : workStatusAvailable === false || teamStatus?.availability === 'unavailable'
      ? 'Trusted current-work status could not be read.'
      : workStatusChecking
        ? 'Reading the selected Workspace state.'
        : teamMission
          ? `Mission: ${teamMission.goalSummary}`
          : checkpoint?.availability === 'available'
            ? `Recorded task: ${checkpoint.taskSummary}`
            : checkpoint?.availability === 'unavailable'
              ? 'Recorded task unavailable.'
              : 'No recorded task for this Workspace.';

  const currentActivityStep = teamMission
    ? `Recorded next step: ${teamMission.nextAction}`
    : checkpoint?.availability === 'available'
      ? `Recorded next step: ${checkpoint.nextActionSummary}`
      : 'No recorded next step.';

  const activityUpdatedAt = teamMission?.updatedAt
    ?? (checkpoint?.availability === 'available' ? checkpoint.updatedAt : undefined);
  const teamDetail = teamMission
    ? [
        teamMission.currentRole ? `Role: ${teamMission.currentRole[0]?.toUpperCase()}${teamMission.currentRole.slice(1)}` : null,
        teamMission.currentTaskSequence ? `Task ${teamMission.currentTaskSequence}/${teamMission.taskCount}` : `${teamMission.taskCount} tasks`,
        `Mission state: ${teamMission.state[0]?.toUpperCase()}${teamMission.state.slice(1)}`,
      ].filter(Boolean).join(' · ')
    : null;
  const approvalDetail = approvalStatus && approvalStatus.pendingCount > 0
    ? approvalStatus.pendingTeamStart && !teamMission
      ? 'Approval: Waiting to start Team Mode'
      : `Approval: ${approvalStatus.pendingCount} pending action${approvalStatus.pendingCount === 1 ? '' : 's'}`
    : currentWorkStatus?.approval.availability === 'unavailable'
      ? 'Approval status unavailable'
      : null;

  const gitStatusLabel = currentWorkStatus?.git.availability === 'available'
    ? currentWorkStatus.git.clean
      ? 'Clean'
      : `${currentWorkStatus.git.changedFiles}${currentWorkStatus.git.truncated ? '+' : ''} changed`
    : 'Unavailable';
  const gitBranchLabel = currentWorkStatus?.git.availability === 'available'
    ? currentWorkStatus.git.branch ?? (currentWorkStatus.git.detached ? 'Detached HEAD' : 'Unknown')
    : 'Unavailable';
  const checkpointLabel = checkpoint?.availability === 'available'
    ? `${checkpoint.taskStatus.replace('_', ' ')} · ${formatEventTime(checkpoint.updatedAt)}`
    : checkpoint?.availability === 'none'
      ? 'No checkpoint'
      : 'Unavailable';
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
            <div className="overview-primary-actions">
              <button
                id="overview-primary-connection-action"
                className="btn btn-primary overview-primary-button"
                disabled={busy || connection === null || (primaryAction !== null && !primaryAction.enabled && Boolean(connection?.profile))}
                onClick={() => void runPrimaryAction()}
              >
                <UiIcon name="connection" size={16} />
                {primaryActionLabel}
              </button>
              <button className="btn btn-ghost overview-details-link" onClick={() => onNavigate('connection')}>
                Connection Setting
              </button>
            </div>
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
      </section>

      <section className="card overview-section overview-workspaces" aria-labelledby="approved-workspaces-title">
        <div className="overview-section-header">
          <div className="overview-section-title">
            <UiIcon name="workspaces" size={19} />
            <h2 id="approved-workspaces-title">Approved workspaces</h2>
          </div>
          <button className="btn btn-link" onClick={() => onNavigate('workspaces')}>
            + Add Workspace
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
              <span role="columnheader">Access</span>
              <span role="columnheader">Status</span>
            </div>
            {visibleWorkspaces.map((workspace) => (
              <div className="overview-workspace-row" role="row" key={workspace.id}>
                <div className="overview-workspace-path" role="cell">
                  <UiIcon name="workspaces" size={19} />
                  <span title={workspace.canonicalRoot}>{workspace.canonicalRoot}</span>
                </div>
                <div className="overview-workspace-access" role="cell">
                  <span className="workspace-access-badge">Read & write</span>
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

      <section className="card overview-summary-card overview-current-activity" aria-labelledby="current-activity-title">
        <div className="overview-section-header">
          <div className="overview-section-title">
            <UiIcon name="team" size={19} />
            <h2 id="current-activity-title">Current activity</h2>
          </div>
          <span className={`badge ${activityBadgeClass}`}>{activityStateLabel}</span>
        </div>
        <div className="overview-current-activity-body">
          <strong>{activityModeLabel}</strong>
          <span title={currentActivityTask}>{currentActivityTask}</span>
          <span title={currentActivityStep}>{currentActivityStep}</span>
          {teamDetail && <span>{teamDetail}</span>}
          {approvalDetail && <span>{approvalDetail}</span>}
          <span>Connection: {statePresentation.label}</span>
          {latestActivity?.availability === 'available' && (
            <span>
              Latest observed: {latestActivity.operationSummary}
              {' · '}
              {formatResultCode(latestActivity.resultSummary)}
              {' · '}
              <time dateTime={latestActivity.observedAt}>{formatEventTime(latestActivity.observedAt)}</time>
            </span>
          )}
          {latestActivity?.availability === 'unavailable' && <span>Latest observed result unavailable.</span>}
          {activityUpdatedAt && <time dateTime={activityUpdatedAt}>Updated {formatEventTime(activityUpdatedAt)}</time>}
          {approvalStatus?.latestCreatedAt && approvalStatus.pendingCount > 0 && (
            <time dateTime={approvalStatus.latestCreatedAt}>Approval requested {formatEventTime(approvalStatus.latestCreatedAt)}</time>
          )}
        </div>
        <div className="overview-current-activity-actions">
          <button className="btn btn-link" onClick={() => onNavigate('activity')}>
            View activity
            <UiIcon name="arrow-right" size={15} />
          </button>
          {teamMission && (
            <button className="btn btn-link" onClick={() => onNavigate('team')}>
              Team details
              <UiIcon name="arrow-right" size={15} />
            </button>
          )}
        </div>
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
                  <span className={`activity-state-icon ${event.tone === 'success' ? 'success' : event.tone === 'error' ? 'error' : 'neutral'}`} aria-hidden="true">
                    <UiIcon name="check" size={16} />
                  </span>
                  <div className="overview-activity-copy">
                    <strong>{event.title}</strong>
                    {event.details[0] && <span>{event.details[0].label}: {event.details[0].value}</span>}
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

        <section className="card overview-summary-card" aria-labelledby="current-session-title">
          <div className="overview-section-header">
            <div className="overview-section-title">
              <UiIcon name="workspaces" size={19} />
              <h2 id="current-session-title">Current Session / Work Status</h2>
            </div>
          </div>

          <dl className="overview-session-list">
            <div>
              <dt>Active workspace</dt>
              <dd title={activeWorkspace?.canonicalRoot}>{activeWorkspace?.displayName ?? 'Unavailable'}</dd>
            </div>
            <div>
              <dt>Git branch</dt>
              <dd>{gitBranchLabel}</dd>
            </div>
            <div>
              <dt>Team / work state</dt>
              <dd>{activityModeLabel} · {activityStateLabel}</dd>
            </div>
            <div>
              <dt>Working tree</dt>
              <dd>{gitStatusLabel}</dd>
            </div>
            <div>
              <dt>Last checkpoint</dt>
              <dd>{checkpointLabel}</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
