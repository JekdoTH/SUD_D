import React, { useCallback, useEffect, useState } from 'react';
import type { AuditEventDto } from '@sud-d/contracts';

export function ActivityPage(): React.ReactElement {
  const [events, setEvents] = useState<AuditEventDto[]>([]);

  const refresh = useCallback(() => {
    void window.sudD.audit.list({ limit: 100 }).then((r) => {
      if (r.ok) setEvents(r.value);
    });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Activity</h1>
        <p className="page-subtitle">Structured audit log — no raw file content stored</p>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div className="card-title" style={{ margin: 0 }}>Recent Events</div>
          <button id="btn-refresh-activity" className="btn btn-ghost" onClick={refresh}>↻ Refresh</button>
        </div>

        {events.length === 0 ? (
          <div className="empty-state">No audit events yet</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Action</th>
                  <th>Workspace</th>
                  <th>Decision</th>
                  <th>Result</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev.id}>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {new Date(ev.timestamp).toLocaleString()}
                    </td>
                    <td><code style={{ fontSize: 12 }}>{ev.action}</code></td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {ev.workspaceId ? ev.workspaceId.slice(0, 8) + '…' : '—'}
                    </td>
                    <td>
                      {ev.policyDecision ? (
                        <span className={`badge ${
                          ev.policyDecision === 'allow' ? 'badge-green'
                          : ev.policyDecision === 'deny' ? 'badge-red'
                          : 'badge-yellow'
                        }`}>{ev.policyDecision}</span>
                      ) : '—'}
                    </td>
                    <td>
                      <span className={`badge ${ev.resultCode === 'OK' ? 'badge-green' : 'badge-red'}`}>
                        {ev.resultCode}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {ev.durationMs.toFixed(0)}ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
