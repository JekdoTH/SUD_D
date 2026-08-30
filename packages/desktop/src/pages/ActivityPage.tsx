import React, { useCallback, useEffect, useState } from 'react';
import type { DesktopActivityEventDto } from '@sud-d/contracts';

function toneBadge(tone: DesktopActivityEventDto['tone']): string {
  switch (tone) {
    case 'success': return 'badge-green';
    case 'warning': return 'badge-yellow';
    case 'error': return 'badge-red';
    case 'info': return 'badge-gray';
  }
}

export function ActivityPage(): React.ReactElement {
  const [events, setEvents] = useState<DesktopActivityEventDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await window.sudD.activity.list({ limit: 100 });
    setLoading(false);
    if (result.ok) {
      setEvents(result.value);
      setError('');
    } else {
      setError(result.error.message);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <>
      <div className="page-header page-header-row">
        <div>
          <h1 className="page-title">Activity</h1>
          <p className="page-subtitle">Recent local lifecycle and security-relevant events, newest first.</p>
        </div>
        <button id="btn-refresh-activity" className="btn btn-ghost" onClick={() => void refresh()} disabled={loading}>
          {loading ? 'Refreshing…' : '↻ Refresh'}
        </button>
      </div>

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
