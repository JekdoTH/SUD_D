import React, { useCallback, useEffect, useState } from 'react';
import type { DoctorCheckDto, DoctorCheckItemDto } from '@sud-d/contracts';

function statusIcon(status: DoctorCheckItemDto['status']): string {
  switch (status) {
    case 'healthy': return '✓';
    case 'warning': return '!';
    case 'error': return '×';
  }
}

function statusTone(status: DoctorCheckItemDto['status']): string {
  switch (status) {
    case 'healthy': return 'tone-success';
    case 'warning': return 'tone-warning';
    case 'error': return 'tone-danger';
  }
}

export function DoctorPage(): React.ReactElement {
  const [result, setResult] = useState<DoctorCheckDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const runChecks = useCallback(async () => {
    setLoading(true);
    const response = await window.sudD.doctor.check();
    setLoading(false);
    if (response.ok) {
      setResult(response.value);
      setError('');
    } else {
      setError(response.error.message);
    }
  }, []);

  useEffect(() => { void runChecks(); }, [runChecks]);

  return (
    <>
      <div className="page-header page-header-row">
        <div>
          <h1 className="page-title">Environment / Doctor</h1>
          <p className="page-subtitle">Local readiness checks for workspace, connection, tunnel, gateway, and storage.</p>
        </div>
        <button id="btn-run-doctor" className="btn btn-ghost" onClick={() => void runChecks()} disabled={loading}>
          {loading ? 'Checking…' : '↻ Re-run'}
        </button>
      </div>

      {error && (
        <div className="callout callout-error" role="alert">
          <strong>Environment checks unavailable</strong>
          <span>{error}</span>
        </div>
      )}

      {loading && !result && <div className="card empty-state">Running checks…</div>}

      {result && (
        <>
          <section className="card doctor-summary-card">
            <div className="card-header-row">
              <div>
                <div className="card-kicker">Environment Summary</div>
                <div className="card-heading">{result.summary}</div>
                <p className="card-description">
                  Checks are local, bounded, and sanitized. Credentials, raw commands, and runtime payloads are never shown here.
                </p>
              </div>
              <span className={`status-chip ${statusTone(result.overallStatus)}`}>
                <span className="status-dot" />
                {result.overallStatus === 'healthy' ? 'Ready' : result.overallStatus === 'warning' ? 'Needs attention' : 'Action required'}
              </span>
            </div>
          </section>

          <section className="card">
            <div className="card-kicker">Readiness Checks</div>
            <div className="check-list doctor-check-list">
              {result.checks.map((check) => (
                <div className="check-item" key={check.id}>
                  <span className={`doctor-check-icon ${statusTone(check.status)}`} aria-hidden="true">
                    {statusIcon(check.status)}
                  </span>
                  <div className="doctor-check-copy">
                    <div className="check-label">{check.label}</div>
                    <div className="check-detail">{check.message}</div>
                    {check.guidance && <div className="doctor-guidance">{check.guidance}</div>}
                  </div>
                  <span className={`badge ${check.status === 'healthy' ? 'badge-green' : check.status === 'warning' ? 'badge-yellow' : 'badge-red'}`}>
                    {check.status}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <details className="card advanced-card">
            <summary>Workspace details</summary>
            <div className="advanced-content">
              {result.workspaceChecks.length === 0 ? (
                <div className="empty-compact">No workspaces registered.</div>
              ) : (
                <div className="check-list">
                  {result.workspaceChecks.map((workspace) => (
                    <div className="check-item" key={workspace.workspaceId}>
                      <span className="check-icon">{workspace.rootExists && workspace.rootIsDirectory ? '✓' : '!'}</span>
                      <div>
                        <div className="check-label">{workspace.displayName}</div>
                        <div className="check-detail">
                          {!workspace.rootExists
                            ? 'Root directory not found'
                            : !workspace.rootIsDirectory
                              ? 'Root path is not a directory'
                              : 'Root exists and is accessible'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </details>
        </>
      )}
    </>
  );
}
