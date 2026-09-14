import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DesktopGitSnapshotDto, IpcResult } from '@sud-d/contracts';
import type { AppPage } from '../App';

interface GitPageProps {
  readonly onNavigate: (page: AppPage) => void;
}

type ActionMessage =
  | { readonly tone: 'warning' | 'error'; readonly text: string; readonly showApprovalLink?: boolean }
  | null;

const RELATION_COPY: Record<DesktopGitSnapshotDto['relation'], string> = {
  unknown: 'Remote relation unknown',
  up_to_date: 'Up to date',
  local_ahead: 'Local commits ready to push',
  remote_ahead: 'Remote commits available',
  diverged: 'Diverged — manual resolution required',
  no_upstream: 'No upstream branch',
  unavailable: 'Remote relation unavailable',
};

export function GitPage({ onNavigate }: GitPageProps): React.ReactElement {
  const [snapshot, setSnapshot] = useState<DesktopGitSnapshotDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState('');
  const [loadError, setLoadError] = useState('');
  const [actionMessage, setActionMessage] = useState<ActionMessage>(null);
  const refreshInFlight = useRef<Promise<void> | null>(null);
  const mutationVersion = useRef(0);

  const [newBranch, setNewBranch] = useState('');
  const [switchBranch, setSwitchBranch] = useState('');
  const [mergeBranch, setMergeBranch] = useState('');
  const [deleteBranch, setDeleteBranch] = useState('');
  const [remoteName, setRemoteName] = useState('');
  const [remoteUrl, setRemoteUrl] = useState('');
  const [primaryRemoteName, setPrimaryRemoteName] = useState('');
  const [cloneUrl, setCloneUrl] = useState('');
  const [cloneDisplayName, setCloneDisplayName] = useState('');
  const [cloneDestination, setCloneDestination] = useState('');

  const refreshSnapshot = useCallback(async (): Promise<void> => {
    if (refreshInFlight.current) return refreshInFlight.current;
    const startedAtMutationVersion = mutationVersion.current;
    const refresh = (async () => {
      try {
        const result = await window.sudD.git.snapshot();
        if (startedAtMutationVersion !== mutationVersion.current) return;
        if (result.ok) {
          setSnapshot(result.value);
          setLoadError('');
        } else {
          setLoadError(result.error.message);
        }
      } catch {
        if (startedAtMutationVersion === mutationVersion.current) {
          setLoadError('Git state could not be read. Review the active Workspace and try Refresh again.');
        }
      }
    })();
    refreshInFlight.current = refresh;
    try {
      await refresh;
    } finally {
      if (refreshInFlight.current === refresh) refreshInFlight.current = null;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSnapshot();
    const timer = window.setInterval(() => void refreshSnapshot(), 5000);
    return () => window.clearInterval(timer);
  }, [refreshSnapshot]);

  const handleMutationResult = useCallback(async (
    action: string,
    request: () => Promise<IpcResult<DesktopGitSnapshotDto>>,
  ): Promise<void> => {
    mutationVersion.current += 1;
    setBusyAction(action);
    setActionMessage(null);
    try {
      const result = await request();
      if (result.ok) {
        setSnapshot(result.value);
        setLoadError('');
        return;
      }
      if (result.error.code === 'GIT_STATUS_STALE') {
        const existingRefresh = refreshInFlight.current;
        if (existingRefresh) {
          await existingRefresh;
          if (refreshInFlight.current === existingRefresh) refreshInFlight.current = null;
        }
        await refreshSnapshot();
        setActionMessage({
          tone: 'warning',
          text: 'Git state changed. Review the refreshed state before retrying.',
        });
        return;
      }
      if (result.error.code === 'APPROVAL_REQUIRED') {
        setActionMessage({
          tone: 'warning',
          showApprovalLink: true,
          text: 'Approval required before this GitHub action can run.',
        });
        return;
      }
      setActionMessage({
        tone: 'error',
        text: `${result.error.message} SUD-D did not retry the Git action. Review the current Git state before trying again.`,
      });
    } catch {
      setActionMessage({
        tone: 'error',
        text: 'The Git action could not be completed. SUD-D did not retry it. Refresh Git state before trying again.',
      });
    } finally {
      setBusyAction('');
    }
  }, [refreshSnapshot]);

  const branchChoices = useMemo(
    () => snapshot?.branches.filter((branch) => !branch.current) ?? [],
    [snapshot],
  );

  useEffect(() => {
    if (!snapshot) return;
    const fallbackBranch = branchChoices[0]?.name ?? '';
    if (!branchChoices.some((branch) => branch.name === switchBranch)) setSwitchBranch(fallbackBranch);
    if (!branchChoices.some((branch) => branch.name === mergeBranch)) setMergeBranch(fallbackBranch);
    if (!branchChoices.some((branch) => branch.name === deleteBranch)) setDeleteBranch(fallbackBranch);
    if (!primaryRemoteName && snapshot.primaryRemote.name) setPrimaryRemoteName(snapshot.primaryRemote.name);
  }, [branchChoices, deleteBranch, mergeBranch, primaryRemoteName, snapshot, switchBranch]);

  const handleClone = async (): Promise<void> => {
    const repositoryUrl = cloneUrl.trim();
    const displayName = cloneDisplayName.trim();
    const destinationPath = cloneDestination.trim();
    if (!repositoryUrl || !displayName || !destinationPath) {
      setActionMessage({ tone: 'error', text: 'Repository URL, display name, and destination are required before cloning.' });
      return;
    }
    if (/^https?:\/\/[^/]*@/i.test(repositoryUrl)) {
      setActionMessage({ tone: 'error', text: 'Credential-bearing repository URLs are not accepted. Use the machine Git authentication flow instead.' });
      return;
    }

    mutationVersion.current += 1;
    setBusyAction('clone');
    setActionMessage(null);
    try {
      const result = await window.sudD.git.clone({ repositoryUrl, displayName, destinationPath });
      if (result.ok) {
        setSnapshot(result.value.snapshot);
        setCloneUrl('');
        setCloneDisplayName('');
        setCloneDestination('');
        setLoadError('');
        return;
      }
      if (result.error.code === 'APPROVAL_REQUIRED') {
        setActionMessage({
          tone: 'warning',
          showApprovalLink: true,
          text: 'Approval required before this GitHub action can run.',
        });
        return;
      }
      setActionMessage({
        tone: 'error',
        text: `${result.error.message} SUD-D did not retry the clone. Review the destination and repository details before trying again.`,
      });
    } catch {
      setActionMessage({
        tone: 'error',
        text: 'Clone could not be completed. SUD-D did not retry it. Review the destination and repository details before trying again.',
      });
    } finally {
      setBusyAction('');
    }
  };

  const pickCloneDestination = async (): Promise<void> => {
    const result = await window.sudD.dialog.openDirectory();
    if (result.ok && result.value) setCloneDestination(result.value);
  };

  const repositoryReady = snapshot?.repository === 'ready';
  const repositoryNotReady = snapshot?.repository === 'not_repository';
  const relationCopy = snapshot ? RELATION_COPY[snapshot.relation] : 'Remote relation unknown';

  return (
    <div className="git-page">
      <div className="page-header git-page-header">
        <div>
          <h1 className="page-title">Git</h1>
          <p className="page-subtitle">Inspect repository state and run bounded branch or GitHub sync actions for the active Workspace.</p>
        </div>
        <button className="btn btn-ghost" disabled={loading} onClick={() => void refreshSnapshot()}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {loadError && (
        <div className="git-action-message git-action-error" role="alert">
          <span>{loadError}</span>
        </div>
      )}

      {actionMessage && (
        <div role="alert" className={`git-action-message git-action-${actionMessage.tone}`}>
          <span>{actionMessage.text}</span>
          {actionMessage.showApprovalLink && (
            <button className="btn btn-ghost" onClick={() => onNavigate('activity')}>
              Review approval
            </button>
          )}
        </div>
      )}

      <section className="card git-section" aria-labelledby="git-repository-heading">
        <div className="git-section-heading">
          <div>
            <h2 id="git-repository-heading" className="card-heading">Repository</h2>
            <p className="card-description">Local repository facts come from the bounded Git snapshot. Network state changes only after an explicit action.</p>
          </div>
          {snapshot && (
            <span className={`badge ${snapshot.clean ? 'badge-green' : 'badge-yellow'}`}>
              {snapshot.clean ? 'Clean' : 'Uncommitted work'}
            </span>
          )}
        </div>

        {loading && !snapshot ? (
          <div className="empty-state">Reading Git state…</div>
        ) : snapshot ? (
          <>
            <dl className="git-facts" aria-label="Repository state">
              <GitFact label="Workspace" value={snapshot.workspace.displayName} />
              <GitFact label="Repository" value={repositoryReady ? 'Ready' : repositoryNotReady ? 'Not a Git repository' : 'Unsupported repository'} />
              <GitFact label="Working tree" value={snapshot.clean ? 'Clean' : `${snapshot.changedFiles} changed file${snapshot.changedFiles === 1 ? '' : 's'}`} />
              <GitFact label="Current branch" value={snapshot.detached ? 'Detached HEAD' : snapshot.currentBranch ?? 'Unknown'} />
              <GitFact label="Primary / Default Branch" value={snapshot.defaultBranch.state === 'known' ? snapshot.defaultBranch.branch ?? 'Unknown' : 'Unknown'} />
              <GitFact label="Primary Remote" value={snapshot.primaryRemote.state === 'resolved' ? snapshot.primaryRemote.name ?? 'Resolved' : titleCase(snapshot.primaryRemote.state)} />
              {snapshot.primaryRemote.safeRepository && <GitFact label="GitHub repository" value={snapshot.primaryRemote.safeRepository} />}
              {snapshot.primaryRemote.transport && <GitFact label="Transport" value={snapshot.primaryRemote.transport.toUpperCase()} />}
              {snapshot.upstreamBranch && <GitFact label="Upstream" value={snapshot.upstreamBranch} />}
              <GitFact label="Remote relation" value={relationCopy} />
              {snapshot.authStatus !== 'unknown' && <GitFact label="Authentication" value={snapshot.authStatus === 'working' ? 'Working' : 'Needs attention'} />}
            </dl>

            {repositoryNotReady && (
              <div className="git-inline-actions">
                <div>
                  <strong>Not a Git repository</strong>
                  <p>Initialize the active Workspace without creating a commit, renaming a branch, or adding a remote.</p>
                </div>
                <button
                  className="btn btn-primary"
                  disabled={!snapshot.operations.initialize.available || Boolean(busyAction)}
                  title={snapshot.operations.initialize.reason}
                  onClick={() => void handleMutationResult('initialize', () => window.sudD.git.init({ expectedSnapshotId: snapshot.snapshotId }))}
                >
                  {busyAction === 'initialize' ? 'Initializing…' : 'Initialize Git'}
                </button>
              </div>
            )}

            {repositoryReady && snapshot.primaryRemote.state !== 'resolved' && (
              <div className="git-remote-setup">
                <div className="git-form-block">
                  <h3>Configure Primary Remote</h3>
                  <p>Add or update a GitHub HTTPS/SSH remote, then select the Primary Remote explicitly when needed.</p>
                  <div className="git-form-grid">
                    <div className="field">
                      <label htmlFor="git-remote-name">Remote name</label>
                      <input id="git-remote-name" className="input" value={remoteName} onChange={(event) => setRemoteName(event.target.value)} placeholder="upstream" />
                    </div>
                    <div className="field git-field-wide">
                      <label htmlFor="git-remote-url">GitHub repository URL</label>
                      <input id="git-remote-url" className="input" value={remoteUrl} onChange={(event) => setRemoteUrl(event.target.value)} placeholder="https://github.com/owner/repository.git" />
                    </div>
                  </div>
                  <button
                    className="btn btn-ghost"
                    disabled={!snapshot.operations.configureRemote.available || !remoteName.trim() || !remoteUrl.trim() || Boolean(busyAction)}
                    title={snapshot.operations.configureRemote.reason}
                    onClick={() => void handleMutationResult('configure', () => window.sudD.git.configure({
                      expectedSnapshotId: snapshot.snapshotId,
                      remoteName: remoteName.trim(),
                      remoteUrl: remoteUrl.trim(),
                    }))}
                  >
                    {busyAction === 'configure' ? 'Saving…' : 'Configure remote'}
                  </button>
                </div>

                <div className="git-form-block">
                  <h3>Select Primary Remote</h3>
                  <p>Use the trusted repository remote name. SUD-D never assumes <code>origin</code>.</p>
                  <div className="field">
                    <label htmlFor="git-primary-remote">Remote name</label>
                    <input id="git-primary-remote" className="input" value={primaryRemoteName} onChange={(event) => setPrimaryRemoteName(event.target.value)} placeholder="upstream" />
                  </div>
                  <button
                    className="btn btn-ghost"
                    disabled={!primaryRemoteName.trim() || Boolean(busyAction)}
                    onClick={() => void handleMutationResult('select', () => window.sudD.git.select({
                      expectedSnapshotId: snapshot.snapshotId,
                      remoteName: primaryRemoteName.trim(),
                    }))}
                  >
                    {busyAction === 'select' ? 'Selecting…' : 'Select Primary Remote'}
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="empty-state">Select an active Workspace to inspect local Git state.</div>
        )}
      </section>

      {repositoryReady && snapshot && (
        <section className="card git-section" aria-labelledby="git-branches-heading">
          <div className="git-section-heading">
            <div>
              <h2 id="git-branches-heading" className="card-heading">Branches</h2>
              <p className="card-description">Create, switch, merge, or safely delete local branches. Dirty-tree and protected-branch blockers stay enforced.</p>
            </div>
          </div>

          <div className="git-branch-grid">
            <GitBranchAction title="Create branch" reason={snapshot.operations.createBranch.reason}>
              <input className="input" value={newBranch} onChange={(event) => setNewBranch(event.target.value)} placeholder="feature/my-change" aria-label="New branch name" />
              <button
                className="btn btn-primary"
                disabled={!snapshot.operations.createBranch.available || !newBranch.trim() || Boolean(busyAction)}
                onClick={() => void handleMutationResult('create', () => window.sudD.git.create({ expectedSnapshotId: snapshot.snapshotId, branchName: newBranch.trim() }))}
              >
                {busyAction === 'create' ? 'Creating…' : 'Create'}
              </button>
            </GitBranchAction>

            <GitBranchAction title="Switch branch" reason={snapshot.operations.switchBranch.reason}>
              <BranchSelect value={switchBranch} onChange={setSwitchBranch} branches={branchChoices} label="Branch to switch to" />
              <button
                className="btn btn-ghost"
                disabled={!snapshot.operations.switchBranch.available || !switchBranch || Boolean(busyAction)}
                onClick={() => void handleMutationResult('switch', () => window.sudD.git.switch({ expectedSnapshotId: snapshot.snapshotId, branchName: switchBranch }))}
              >
                {busyAction === 'switch' ? 'Switching…' : 'Switch'}
              </button>
            </GitBranchAction>

            <GitBranchAction title="Merge branch" reason={snapshot.operations.mergeBranch.reason}>
              <BranchSelect value={mergeBranch} onChange={setMergeBranch} branches={branchChoices} label="Branch to merge" />
              <button
                className="btn btn-ghost"
                disabled={!snapshot.operations.mergeBranch.available || !mergeBranch || Boolean(busyAction)}
                onClick={() => void handleMutationResult('merge', () => window.sudD.git.merge({ expectedSnapshotId: snapshot.snapshotId, branchName: mergeBranch }))}
              >
                {busyAction === 'merge' ? 'Merging…' : 'Merge'}
              </button>
            </GitBranchAction>

            <GitBranchAction title="Safe delete local branch" reason={snapshot.operations.deleteBranch.reason}>
              <BranchSelect value={deleteBranch} onChange={setDeleteBranch} branches={branchChoices} label="Branch to delete" />
              <button
                className="btn btn-danger"
                disabled={!snapshot.operations.deleteBranch.available || !deleteBranch || Boolean(busyAction)}
                onClick={() => void handleMutationResult('delete', () => window.sudD.git.delete({ expectedSnapshotId: snapshot.snapshotId, branchName: deleteBranch }))}
              >
                {busyAction === 'delete' ? 'Deleting…' : 'Safe delete'}
              </button>
            </GitBranchAction>
          </div>
        </section>
      )}

      {repositoryReady && snapshot && (
        <section className="card git-section" aria-labelledby="git-sync-heading">
          <div className="git-section-heading">
            <div>
              <h2 id="git-sync-heading" className="card-heading">Remote Sync</h2>
              <p className="card-description">Network Git runs only after you choose an action. SUD-D does not auto-poll, auto-stash, auto-rebase, or force history.</p>
            </div>
            <span className={`git-relation git-relation-${snapshot.relation}`}>{relationCopy}</span>
          </div>

          <div className="git-sync-actions">
            <GitNetworkAction
              title="Sync from GitHub"
              description="Bring the current branch forward only when the reviewed Git state allows a safe fast-forward path."
              available={snapshot.operations.sync.available}
              reason={snapshot.operations.sync.reason}
              busy={busyAction === 'sync'}
              disabled={Boolean(busyAction)}
              onClick={() => void handleMutationResult('sync', () => window.sudD.git.sync({ expectedSnapshotId: snapshot.snapshotId }))}
            />
            <GitNetworkAction
              title="Push to GitHub"
              description="Send existing local commits to the Primary Remote without force-push or automatic commit creation."
              available={snapshot.operations.push.available}
              reason={snapshot.operations.push.reason}
              busy={busyAction === 'push'}
              disabled={Boolean(busyAction)}
              onClick={() => void handleMutationResult('push', () => window.sudD.git.push({ expectedSnapshotId: snapshot.snapshotId }))}
            />
          </div>
        </section>
      )}

      {(!snapshot || snapshot.repository === 'not_repository') && (
        <section className="card git-section" aria-labelledby="git-clone-heading">
          <div className="git-section-heading">
            <div>
              <h2 id="git-clone-heading" className="card-heading">Clone from GitHub</h2>
              <p className="card-description">Clone an existing GitHub repository into a safe empty destination. Authentication stays with the machine Git configuration.</p>
            </div>
          </div>
          <div className="git-clone-form">
            <div className="field git-field-wide">
              <label htmlFor="git-clone-url">GitHub repository URL</label>
              <input id="git-clone-url" className="input" value={cloneUrl} onChange={(event) => setCloneUrl(event.target.value)} placeholder="https://github.com/owner/repository.git" />
            </div>
            <div className="field">
              <label htmlFor="git-clone-name">Display name</label>
              <input id="git-clone-name" className="input" value={cloneDisplayName} onChange={(event) => setCloneDisplayName(event.target.value)} placeholder="Repository" />
            </div>
            <div className="field git-field-wide">
              <label htmlFor="git-clone-destination">Destination path</label>
              <div className="input-row">
                <input id="git-clone-destination" className="input" value={cloneDestination} onChange={(event) => setCloneDestination(event.target.value)} placeholder="C:\\Projects\\repository" />
                <button className="btn btn-ghost" onClick={() => void pickCloneDestination()}>Browse…</button>
              </div>
            </div>
            <div className="git-clone-submit">
              <button className="btn btn-primary" disabled={Boolean(busyAction)} onClick={() => void handleClone()}>
                {busyAction === 'clone' ? 'Cloning…' : 'Clone from GitHub'}
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function GitFact({ label, value }: { readonly label: string; readonly value: string }): React.ReactElement {
  return (
    <div className="git-fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function GitBranchAction({
  title,
  reason,
  children,
}: {
  readonly title: string;
  readonly reason?: string;
  readonly children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="git-branch-action">
      <div>
        <h3>{title}</h3>
        {reason && <p>{reason}</p>}
      </div>
      <div className="git-action-controls">{children}</div>
    </div>
  );
}

function BranchSelect({
  value,
  onChange,
  branches,
  label,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly branches: DesktopGitSnapshotDto['branches'];
  readonly label: string;
}): React.ReactElement {
  return (
    <select className="input" value={value} onChange={(event) => onChange(event.target.value)} aria-label={label}>
      <option value="">Select branch</option>
      {branches.map((branch) => <option key={branch.name} value={branch.name}>{branch.name}</option>)}
    </select>
  );
}

function GitNetworkAction({
  title,
  description,
  available,
  reason,
  busy,
  disabled,
  onClick,
}: {
  readonly title: string;
  readonly description: string;
  readonly available: boolean;
  readonly reason?: string;
  readonly busy: boolean;
  readonly disabled: boolean;
  readonly onClick: () => void;
}): React.ReactElement {
  return (
    <div className="git-network-action">
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
        {!available && reason && <p className="git-blocked-reason">Blocked: {reason}</p>}
      </div>
      <button className="btn btn-primary" disabled={!available || disabled} title={reason} onClick={onClick}>
        {busy ? 'Working…' : title}
      </button>
    </div>
  );
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ');
}
