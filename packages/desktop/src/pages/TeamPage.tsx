import React, { useCallback, useEffect, useState } from 'react';
import type { DesktopTeamMissionDto } from '@sud-d/contracts';

function stateBadge(state: DesktopTeamMissionDto['state']): string {
  switch (state) {
    case 'completed': return 'badge-green';
    case 'blocked': return 'badge-red';
    case 'stopped': return 'badge-gray';
    case 'planning':
    case 'implementing':
    case 'reviewing':
      return 'badge-yellow';
  }
}

export function TeamPage(): React.ReactElement {
  const [mission, setMission] = useState<DesktopTeamMissionDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const refresh = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    const result = await window.sudD.team.status({});
    if (showLoading) setLoading(false);
    if (result.ok) {
      setMission(result.value);
      setError('');
    } else {
      setError(result.error.message);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { void refresh(false); }, 3000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const stopMission = useCallback(async () => {
    setBusy(true);
    setMessage('');
    setError('');
    const result = await window.sudD.team.stop({});
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      await refresh(false);
      return;
    }
    setMission(result.value);
    setMessage('Team mission stopped. No files, Git state, approvals, or processes were changed.');
  }, [refresh]);

  return (
    <>
      <div className="page-header page-header-row">
        <div>
          <h1 className="page-title">Team Mode</h1>
          <p className="page-subtitle">Sequential Planner → Implementer → Reviewer orchestration. No Execute capability is available.</p>
        </div>
        <button id="btn-refresh-team" className="btn btn-ghost" onClick={() => void refresh()} disabled={loading}>
          {loading ? 'Refreshing…' : '↻ Refresh'}
        </button>
      </div>

      {error && (
        <div className="callout callout-error" role="alert">
          <strong>Team status unavailable</strong>
          <span>{error}</span>
        </div>
      )}
      {message && (
        <div className="callout callout-info" role="status">
          <span>{message}</span>
        </div>
      )}

      <section className="card team-card">
        <div className="card-header-row">
          <div>
            <div className="card-kicker">Current mission</div>
            <div className="card-heading">{mission?.goalSummary ?? 'No active Team mission'}</div>
          </div>
          {mission && <span className={`badge ${stateBadge(mission.state)}`}>{mission.state}</span>}
        </div>

        {loading && !mission ? (
          <div className="empty-state">Loading Team state…</div>
        ) : !mission ? (
          <div className="empty-state compact-empty">
            <strong>No active mission</strong>
            <span>Start Team Mode from the connected AI with team.start(goal). Team tools only maintain orchestration state.</span>
          </div>
        ) : (
          <div className="team-details">
            <div className="activity-details">
              <span>Role: {mission.currentRole ?? 'none'}</span>
              <span>Review round: {mission.reviewRound}/3</span>
              <span>Workspace: {mission.workspaceId}</span>
              {mission.freshnessKind && <span>Freshness: {mission.freshnessKind}</span>}
            </div>
            {mission.blockedReason && (
              <div className="callout callout-error" role="status">
                <strong>Blocked: {mission.blockedReason}</strong>
                <span>{mission.blockedReasonSummary ?? 'The mission needs a safe re-evaluation.'}</span>
              </div>
            )}
            <div className="team-columns">
              <div>
                <h2 className="section-title">Work items</h2>
                {mission.workItems.length === 0 ? <div className="empty-compact">No work items yet.</div> : (
                  <div className="activity-list">
                    {mission.workItems.map((item) => (
                      <div className="activity-row" key={item.id}>
                        <div>
                          <strong>{item.sequence}. {item.title}</strong>
                          {item.targetPathHint && <div className="muted small">{item.targetPathHint}</div>}
                        </div>
                        <span className="badge badge-gray">{item.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <h2 className="section-title">Timeline</h2>
                {mission.handoffs.length === 0 ? <div className="empty-compact">No role handoff yet.</div> : (
                  <div className="activity-list">
                    {mission.handoffs.map((handoff) => (
                      <div className="activity-row" key={handoff.id}>
                        <div>
                          <strong>{handoff.fromRole} · {handoff.outcome}</strong>
                          <div className="muted small">{handoff.summary}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {mission.findings.length > 0 && (
              <div>
                <h2 className="section-title">Reviewer findings</h2>
                <div className="activity-list">
                  {mission.findings.map((finding) => (
                    <div className="activity-row" key={finding.id}>
                      <div>
                        <strong>{finding.severity}: {finding.summary}</strong>
                        {finding.targetPathHint && <div className="muted small">{finding.targetPathHint}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!['completed', 'blocked', 'stopped'].includes(mission.state) && (
              <button id="btn-stop-team" className="btn btn-danger" disabled={busy} onClick={() => void stopMission()}>
                {busy ? 'Stopping…' : 'Stop Team'}
              </button>
            )}
          </div>
        )}
      </section>
    </>
  );
}
