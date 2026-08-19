import React, { useCallback, useEffect, useState } from 'react';
import type { WorkspaceDto } from '@sud-d/contracts';

export function ProjectsPage(): React.ReactElement {
  const [workspaces, setWorkspaces] = useState<WorkspaceDto[]>([]);
  const [displayName, setDisplayName] = useState('');
  const [rootPath, setRootPath]       = useState('');
  const [error, setError]             = useState('');
  const [loading, setLoading]         = useState(false);

  const refresh = useCallback(() => {
    void window.sudD.workspace.list().then((r) => {
      if (r.ok) setWorkspaces(r.value);
    });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handlePickDir = async () => {
    const r = await window.sudD.dialog.openDirectory();
    if (r.ok && r.value) setRootPath(r.value);
  };

  const handleAdd = async () => {
    setError('');
    if (!displayName.trim()) { setError('Display name is required'); return; }
    if (!rootPath.trim())    { setError('Root path is required');    return; }
    setLoading(true);
    const r = await window.sudD.workspace.add({ displayName: displayName.trim(), rootPath: rootPath.trim() });
    setLoading(false);
    if (!r.ok) { setError(r.error.message); return; }
    setDisplayName(''); setRootPath('');
    refresh();
  };

  const handleSelect = async (id: string) => {
    const r = await window.sudD.workspace.select({ workspaceId: id });
    if (!r.ok) setError(r.error.message);
    else refresh();
  };

  const handleRemove = async (id: string) => {
    const r = await window.sudD.workspace.remove({ workspaceId: id });
    if (!r.ok) setError(r.error.message);
    else refresh();
  };

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Projects</h1>
        <p className="page-subtitle">Manage registered Workspace roots</p>
      </div>

      <div className="card">
        <div className="card-title">Add Workspace</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="field">
            <label>Display Name</label>
            <input
              id="ws-display-name"
              className="input"
              placeholder="My Project"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Root Path</label>
            <div className="input-row">
              <input
                id="ws-root-path"
                className="input"
                placeholder="C:\\Projects\\my-app"
                value={rootPath}
                onChange={(e) => setRootPath(e.target.value)}
              />
              <button id="btn-pick-dir" className="btn btn-ghost" onClick={() => void handlePickDir()}>Browse…</button>
            </div>
          </div>
          {error && <div className="error-text">{error}</div>}
          <div>
            <button
              id="btn-add-workspace"
              className="btn btn-primary"
              disabled={loading}
              onClick={() => void handleAdd()}
            >
              {loading ? 'Adding…' : '+ Add Workspace'}
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Registered Workspaces ({workspaces.length})</div>
        {workspaces.length === 0 ? (
          <div className="empty-state">No workspaces registered yet</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Canonical Root</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {workspaces.map((ws) => (
                  <tr key={ws.id}>
                    <td>
                      {ws.isActive && <span className="ws-active-dot" />}
                      {ws.displayName}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-secondary)' }}>
                      {ws.canonicalRoot}
                    </td>
                    <td>
                      {ws.isActive
                        ? <span className="badge badge-green">Active</span>
                        : <span className="badge badge-gray">Inactive</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {!ws.isActive && (
                          <button
                            id={`btn-select-ws-${ws.id}`}
                            className="btn btn-ghost"
                            style={{ padding: '4px 10px', fontSize: 12 }}
                            onClick={() => void handleSelect(ws.id)}
                          >Select</button>
                        )}
                        <button
                          id={`btn-remove-ws-${ws.id}`}
                          className="btn btn-danger"
                          style={{ padding: '4px 10px', fontSize: 12 }}
                          onClick={() => void handleRemove(ws.id)}
                        >Remove</button>
                      </div>
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
