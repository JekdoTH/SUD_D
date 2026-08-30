import React from 'react';

export function RecoveryPage(): React.ReactElement {
  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Recovery</h1>
        <p className="page-subtitle">Recoverable file changes will appear here in a future milestone.</p>
      </div>

      <div className="callout callout-neutral">
        <strong>Recovery is not enabled in M0.6</strong>
        <span>No file mutation or recovery engine is active yet. This page is intentionally informational only.</span>
      </div>

      <div className="recovery-grid">
        <section className="card">
          <div className="card-kicker">Changed / Deleted Files</div>
          <div className="empty-state compact-empty">
            <div className="empty-icon">↶</div>
            <strong>No recoverable changes</strong>
            <span>Safe file mutation is not enabled yet.</span>
          </div>
        </section>

        <section className="card">
          <div className="card-kicker">Checkpoints</div>
          <div className="empty-state compact-empty">
            <div className="empty-icon">◇</div>
            <strong>No checkpoints</strong>
            <span>Checkpoint creation belongs to a future milestone.</span>
          </div>
        </section>

        <section className="card span-2">
          <div className="card-kicker">Recovery History</div>
          <div className="empty-state compact-empty">
            <strong>Nothing to restore yet</strong>
            <span>Recovery history will become available only after the real recovery engine is implemented.</span>
          </div>
        </section>
      </div>
    </>
  );
}
