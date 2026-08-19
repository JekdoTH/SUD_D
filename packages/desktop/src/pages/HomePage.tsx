import React, { useEffect, useState } from 'react';
import type { WorkspaceDto, AuditEventDto } from '@sud-d/contracts';

interface HomePageProps {
  onNavigate: (page: 'home' | 'projects' | 'activity' | 'settings' | 'doctor') => void;
}

export function HomePage({ onNavigate }: HomePageProps): React.ReactElement {
  const [workspaces, setWorkspaces] = useState<WorkspaceDto[]>([]);
  const [recentEvents, setRecentEvents] = useState<AuditEventDto[]>([]);
  const [status, setStatus] = useState<string>('—');

  useEffect(() => {
    void window.sudD.health.check().then((r) => {
      if (r.ok) setStatus(`v${r.value.version} — ${r.value.status}`);
    });
    void window.sudD.workspace.list().then((r) => {
      if (r.ok) setWorkspaces(r.value);
    });
    void window.sudD.audit.list({ limit: 5 }).then((r) => {
      if (r.ok) setRecentEvents(r.value);
    });
  }, []);

  const active = workspaces.find((w) => w.isActive);

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Home</h1>
        <p className="page-subtitle">SUD-D Control Center — local AI agent runtime foundation</p>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">System Status</div>
          <div className="stat-value accent" style={{ fontSize: 14, paddingTop: 4 }}>{status}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Workspaces</div>
          <div className="stat-value accent">{workspaces.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active Workspace</div>
          <div className="stat-value" style={{ fontSize: 13, paddingTop: 4 }}>
            {active ? (
              <><span className="ws-active-dot" />{active.displayName}</>
            ) : (
              <span style={{ color: 'var(--text-dim)' }}>None</span>
            )}
          </div>
        </div>
      </div>

      {active && (
        <div className="card">
          <div className="card-title">Active Workspace</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            <div style={{ marginBottom: 4 }}><strong style={{ color: 'var(--text-primary)' }}>{active.displayName}</strong></div>
            <div style={{ fontFamily: 'monospace', fontSize: 12 }}>{active.canonicalRoot}</div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">Recent Activity</div>
        {recentEvents.length === 0 ? (
          <div className="empty-state">No activity yet</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Action</th><th>Result</th><th>Time</th></tr>
              </thead>
              <tbody>
                {recentEvents.map((ev) => (
                  <tr key={ev.id}>
                    <td>{ev.action}</td>
                    <td>
                      <span className={`badge ${ev.resultCode === 'OK' ? 'badge-green' : 'badge-red'}`}>
                        {ev.resultCode}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                      {new Date(ev.timestamp).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ marginTop: 14 }}>
          <button className="btn btn-ghost" onClick={() => onNavigate('activity')}>View all activity →</button>
        </div>
      </div>
    </>
  );
}
