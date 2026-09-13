import React from 'react';

interface PolicyRow {
  situation: string;
  decision: string;
  badgeClass: string;
}

const POLICY_TABLE: PolicyRow[] = [
  { situation: 'Normal Workspace read',          decision: 'Allow',  badgeClass: 'badge-green'  },
  { situation: 'Normal Workspace search',        decision: 'Allow',  badgeClass: 'badge-green'  },
  { situation: 'Normal Workspace create/modify', decision: 'Allow',  badgeClass: 'badge-green'  },
  { situation: 'Delete',                         decision: 'Ask',    badgeClass: 'badge-yellow' },
  { situation: 'Credential read/modify',         decision: 'Ask',    badgeClass: 'badge-yellow' },
  { situation: 'Process execute',                decision: 'Ask',    badgeClass: 'badge-yellow' },
  { situation: 'Network',                        decision: 'Deny',   badgeClass: 'badge-red'    },
  { situation: 'Outside Workspace',              decision: 'Deny',   badgeClass: 'badge-red'    },
  { situation: 'InternalRoot',                   decision: 'Deny',   badgeClass: 'badge-red'    },
  { situation: 'Permanent delete (MCP)',         decision: 'Deny',   badgeClass: 'badge-red'    },
];

export function SettingsPage(): React.ReactElement {
  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Security</h1>
        <p className="page-subtitle">Baseline permission policy — read-only display</p>
      </div>

      <div className="card security-posture-card">
        <div className="card-title">Safety posture</div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
          Persistent security boundaries remain enforced regardless of the selected Approval Mode.
        </p>
        <ul className="security-posture-list">
          <li>Workspace-bound access</li>
          <li>Network denied by default</li>
          <li>Credentials stay hidden from the renderer</li>
        </ul>
      </div>

      <div className="card">
        <div className="card-title">Baseline Policy</div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
          These are the built-in default decisions applied to all operations.
          Approval Mode can automate eligible ASK-class actions, but it never bypasses these Policy decisions or hard boundaries.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0 24px', alignItems: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.6px', paddingBottom: 8, borderBottom: '1px solid var(--bg-border)' }}>Situation</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.6px', paddingBottom: 8, borderBottom: '1px solid var(--bg-border)' }}>Decision</div>
          {POLICY_TABLE.map((row) => (
            <React.Fragment key={row.situation}>
              <div className="policy-row" style={{ display: 'contents' }}>
                <div style={{ padding: '10px 0', borderBottom: '1px solid var(--bg-border)', fontSize: 13, color: 'var(--text-secondary)' }}>{row.situation}</div>
                <div style={{ padding: '10px 0', borderBottom: '1px solid var(--bg-border)' }}>
                  <span className={`badge ${row.badgeClass}`}>{row.decision}</span>
                </div>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Security Invariants</div>
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            'Renderer sandbox: nodeIntegration=false, contextIsolation=true',
            'All privileged IPC inputs validated with Zod',
            'IPC sender verified against main window WebContents',
            'Paths canonicalized before authorization',
            'InternalRoot paths denied before workspace containment checks',
            'Symlinks and junctions denied in resource resolution',
            'Audit metadata sanitized — no secrets persisted',
            'Approval Mode never bypasses Policy DENY or hard boundaries',
          ].map((item) => (
            <li key={item} style={{ display: 'flex', gap: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
              <span style={{ color: 'var(--green)' }}>✓</span>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
