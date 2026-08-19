import React, { useCallback, useEffect, useState } from 'react';
import type { DoctorCheckDto } from '@sud-d/contracts';

export function DoctorPage(): React.ReactElement {
  const [result, setResult] = useState<DoctorCheckDto | null>(null);
  const [loading, setLoading] = useState(true);

  const runChecks = useCallback(() => {
    setLoading(true);
    void window.sudD.doctor.check().then((r) => {
      setLoading(false);
      if (r.ok) setResult(r.value);
    });
  }, []);

  useEffect(() => { runChecks(); }, [runChecks]);

  const Check = ({
    ok, label, detail,
  }: { ok: boolean; label: string; detail?: string }) => (
    <div className="check-item">
      <span className="check-icon">{ok ? '✅' : '❌'}</span>
      <div>
        <div className="check-label">{label}</div>
        {detail && <div className="check-detail">{detail}</div>}
      </div>
    </div>
  );

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Doctor</h1>
        <p className="page-subtitle">System health checks</p>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className="card-title" style={{ margin: 0 }}>Health Checks</div>
          <button id="btn-run-doctor" className="btn btn-ghost" onClick={runChecks} disabled={loading}>
            {loading ? 'Checking…' : '↻ Re-run'}
          </button>
        </div>

        {loading && <div className="empty-state">Running checks…</div>}

        {!loading && result && (
          <div className="check-list">
            <Check
              ok={result.dataDirectoryWritable}
              label="Application data directory writable"
              detail="%LOCALAPPDATA%\\SUD-D"
            />
            <Check
              ok={result.sqliteHealthy}
              label="SQLite database healthy"
              detail="WAL mode, migrations applied"
            />
            {result.workspaceChecks.length === 0 && (
              <div className="check-item">
                <span className="check-icon">ℹ️</span>
                <div>
                  <div className="check-label">No workspaces registered</div>
                  <div className="check-detail">Add a workspace in Projects</div>
                </div>
              </div>
            )}
            {result.workspaceChecks.map((ws) => (
              <Check
                key={ws.workspaceId}
                ok={ws.rootExists && ws.rootIsDirectory}
                label={`Workspace: ${ws.displayName}`}
                detail={
                  !ws.rootExists ? 'Root directory not found'
                  : !ws.rootIsDirectory ? 'Root path is not a directory'
                  : 'Root exists and is accessible'
                }
              />
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Upcoming Checks</div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          MCP server health, Git availability, and recovery snapshot checks will be added in later phases.
        </p>
      </div>
    </>
  );
}
