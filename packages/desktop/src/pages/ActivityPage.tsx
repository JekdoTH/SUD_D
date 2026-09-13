import React, { useCallback, useEffect, useState } from 'react';
import type { ApprovalModeDto, DesktopActivityEventDto, DesktopApprovalRequestDto } from '@sud-d/contracts';

function toneBadge(tone: DesktopActivityEventDto['tone']): string {
  switch (tone) {
    case 'success': return 'badge-green';
    case 'warning': return 'badge-yellow';
    case 'error': return 'badge-red';
    case 'info': return 'badge-gray';
  }
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

export function ActivityPage(): React.ReactElement {
  const [events, setEvents] = useState<DesktopActivityEventDto[]>([]);
  const [approvals, setApprovals] = useState<DesktopApprovalRequestDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [approvalError, setApprovalError] = useState('');
  const [approvalMessage, setApprovalMessage] = useState('');
  const [respondingId, setRespondingId] = useState('');
  const [approvalMode, setApprovalMode] = useState<ApprovalModeDto>('standard');
  const [modeSaving, setModeSaving] = useState(false);

  const refresh = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    const [activityResult, approvalResult, modeResult] = await Promise.all([
      window.sudD.activity.list({ limit: 100 }),
      window.sudD.approval.list({ limit: 50 }),
      window.sudD.approval.getMode(),
    ]);
    if (showLoading) setLoading(false);

    if (activityResult.ok) {
      setEvents(activityResult.value);
      setError('');
    } else {
      setError(activityResult.error.message);
    }

    if (approvalResult.ok) {
      setApprovals(approvalResult.value);
      setApprovalError('');
    } else {
      setApprovalError(approvalResult.error.message);
    }

    if (modeResult.ok) {
      setApprovalMode(modeResult.value.mode);
    } else {
      setApprovalError(modeResult.error.message);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { void refresh(false); }, 3000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const respond = useCallback(async (approvalRequestId: string, decision: 'approve' | 'deny') => {
    setRespondingId(approvalRequestId);
    setApprovalMessage('');
    setApprovalError('');
    const result = await window.sudD.approval.respond({ approvalRequestId, decision });
    setRespondingId('');
    if (!result.ok) {
      setApprovalError(result.error.message);
      await refresh(false);
      return;
    }
    setApprovalMessage(result.value.message);
    await refresh(false);
  }, [refresh]);

  const changeApprovalMode = useCallback(async (mode: ApprovalModeDto) => {
    if (modeSaving || mode === approvalMode) return;
    setModeSaving(true);
    setApprovalError('');
    const result = await window.sudD.approval.setMode({ mode });
    setModeSaving(false);
    if (!result.ok) {
      setApprovalError(result.error.message);
      return;
    }
    setApprovalMode(result.value.mode);
    setApprovalMessage(`Approval Mode changed to ${APPROVAL_MODE_OPTIONS.find((option) => option.mode === result.value.mode)?.label ?? result.value.mode}.`);
  }, [approvalMode, modeSaving]);

  return (
    <>
      <div className="page-header page-header-row">
        <div>
          <h1 className="page-title">Activity</h1>
          <p className="page-subtitle">Review protected actions and recent local security-relevant events.</p>
        </div>
        <button id="btn-refresh-activity" className="btn btn-ghost" onClick={() => void refresh()} disabled={loading}>
          {loading ? 'Refreshing…' : '↻ Refresh'}
        </button>
      </div>

      <section className="card approval-mode-card" aria-labelledby="approval-mode-heading">
        <div className="approval-mode-copy">
          <div id="approval-mode-heading" className="card-heading">Approval Mode</div>
          <p className="card-description">Choose how much bounded local work SUD-D may approve automatically. Policy hard boundaries always stay enforced.</p>
        </div>
        <div className="approval-mode-options" role="radiogroup" aria-label="Approval Mode">
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

      <section className="card approval-card">
        <div className="card-header-row">
          <div>
            <div className="card-kicker">Pending approvals</div>
            <div className="card-heading">Protected actions waiting for you</div>
            <p className="card-description">Approve or deny one exact action. Approval is one-time; retry the action from the connected AI after approving.</p>
          </div>
          <span className="badge badge-yellow">{approvals.length} pending</span>
        </div>

        {approvalError && (
          <div className="callout callout-error" role="alert">
            <strong>Approvals unavailable</strong>
            <span>{approvalError}</span>
          </div>
        )}
        {approvalMessage && (
          <div className="callout callout-info" role="status">
            <span>{approvalMessage}</span>
          </div>
        )}

        {loading && approvals.length === 0 ? (
          <div className="empty-state">Loading approvals…</div>
        ) : approvals.length === 0 ? (
          <div className="empty-state compact-empty">
            <strong>No pending approvals</strong>
            <span>Protected actions that need your decision will appear here.</span>
          </div>
        ) : (
          <div className="approval-list">
            {approvals.map((approval) => {
              const busy = respondingId === approval.id;
              return (
                <div className="approval-row" key={approval.id}>
                  <div className="approval-context">
                    <strong>{approval.title}</strong>
                    {approval.resourceLabel && <div className="approval-resource">{approval.resourceLabel}</div>}
                    <div className="activity-details">
                      <span>Capability: {approval.capability}</span>
                      <span>Effect: {approval.effect}</span>
                      <span>Sensitivity: {approval.sensitivity}</span>
                      <span>Expires: {new Date(approval.expiresAt).toLocaleTimeString()}</span>
                    </div>
                  </div>
                  <div className="approval-actions">
                    <button
                      id={`btn-deny-approval-${approval.id}`}
                      className="btn btn-danger"
                      disabled={busy}
                      onClick={() => void respond(approval.id, 'deny')}
                    >
                      Deny
                    </button>
                    <button
                      id={`btn-approve-approval-${approval.id}`}
                      className="btn btn-primary"
                      disabled={busy}
                      onClick={() => void respond(approval.id, 'approve')}
                    >
                      {busy ? 'Working…' : 'Approve'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {error && (
        <div className="callout callout-error" role="alert">
          <strong>Activity unavailable</strong>
          <span>{error}</span>
        </div>
      )}

      <section className="card">
        <div className="card-header-row">
          <div>
            <div className="card-kicker">Audit Activity</div>
            <div className="card-heading">Recent events</div>
          </div>
          <span className="badge badge-gray">{events.length} shown</span>
        </div>

        {loading && events.length === 0 ? (
          <div className="empty-state">Loading activity…</div>
        ) : events.length === 0 ? (
          <div className="empty-state compact-empty">
            <strong>No activity yet</strong>
            <span>Real lifecycle and audit events will appear here after they occur.</span>
          </div>
        ) : (
          <div className="activity-list">
            {events.map((event) => (
              <div className="activity-row" key={event.id}>
                <div>
                  <strong>{event.title}</strong>
                  <div className="muted small">{new Date(event.timestamp).toLocaleString()}</div>
                  {event.details.length > 0 && (
                    <div className="activity-details">
                      {event.details.map((detail) => (
                        <span key={`${event.id}-${detail.label}`}>{detail.label}: {detail.value}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="activity-result">
                  <span className={`badge ${toneBadge(event.tone)}`}>{event.resultCode}</span>
                  <span className="muted small">{event.category}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
