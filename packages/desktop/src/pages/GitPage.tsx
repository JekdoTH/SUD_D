import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { DesktopGitSnapshotDto, IpcResult } from '@sud-d/contracts';
import type { AppPage } from '../App';
import { presentGitRevisionFeedback } from '../git-revision-feedback';

interface GitPageProps {
  readonly onNavigate: (page: AppPage) => void;
}

type ActionMessage =
  | { readonly tone: 'success' | 'warning' | 'error'; readonly text: string }
  | null;

type PendingGitApproval = {
  readonly action: string;
  readonly approvalRequestId: string;
  readonly request: () => Promise<IpcResult<DesktopGitSnapshotDto>>;
  readonly beforeHeadSha?: string;
};

type GitMutationFeedbackOptions = {
  readonly beforeHeadSha?: string;
  readonly announceSyncStart?: boolean;
};

export function GitPage({ onNavigate }: GitPageProps): React.ReactElement {
  void onNavigate;
  const [snapshot, setSnapshot] = useState<DesktopGitSnapshotDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState('');
  const [loadError, setLoadError] = useState('');
  const [actionMessage, setActionMessage] = useState<ActionMessage>(null);
  const [pendingApproval, setPendingApproval] = useState<PendingGitApproval | null>(null);
  const [approvalDecisionBusy, setApprovalDecisionBusy] = useState<'approve' | 'deny' | ''>('');
  const [syncExecutionFrom, setSyncExecutionFrom] = useState<string | null>(null);
  const refreshInFlight = useRef<Promise<void> | null>(null);
  const approvalResponding = useRef(false);
  const mutationVersion = useRef(0);

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
          setLoadError('Git state could not be read. Check the active Workspace or ask ChatGPT.');
        }
      } catch {
        if (startedAtMutationVersion === mutationVersion.current) {
          setLoadError('Git state could not be read. Check the active Workspace or ask ChatGPT.');
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
  }, [refreshSnapshot]);

  const handleMutationResult = useCallback(async (
    action: string,
    request: () => Promise<IpcResult<DesktopGitSnapshotDto>>,
    options: GitMutationFeedbackOptions = {},
  ): Promise<void> => {
    mutationVersion.current += 1;
    setBusyAction(action);
    setSyncExecutionFrom(
      action === 'sync' && options.announceSyncStart && options.beforeHeadSha
        ? options.beforeHeadSha
        : null,
    );
    setActionMessage(null);
    try {
      const result = await request();
      if (result.ok) {
        setPendingApproval(null);
        setSnapshot(result.value);
        setLoadError('');
        setActionMessage({
          tone: 'success',
          text: gitSuccessMessage(action, options.beforeHeadSha, result.value.headSha),
        });
        return;
      }
      if (result.error.code === 'GIT_STATUS_STALE') {
        setPendingApproval(null);
        const existingRefresh = refreshInFlight.current;
        if (existingRefresh) {
          await existingRefresh;
          if (refreshInFlight.current === existingRefresh) refreshInFlight.current = null;
        }
        await refreshSnapshot();
        setActionMessage({
          tone: 'warning',
          text: 'Git changed while the action was running. Review the updated status and try again.',
        });
        return;
      }
      if (result.error.code === 'APPROVAL_REQUIRED') {
        const approvalRequestId = result.error.metadata?.approvalRequestId;
        if (typeof approvalRequestId !== 'string' || approvalRequestId.length === 0) {
          setPendingApproval(null);
          setActionMessage({
            tone: 'error',
            text: 'Approval could not be prepared safely. Run the Git action again.',
          });
          return;
        }
        setPendingApproval({
          action,
          approvalRequestId,
          request,
          ...(options.beforeHeadSha ? { beforeHeadSha: options.beforeHeadSha } : {}),
        });
        setActionMessage({
          tone: 'warning',
          text: 'Approval required before this GitHub action can run.',
        });
        return;
      }
      setPendingApproval(null);
      setActionMessage({ tone: 'error', text: gitErrorCopy(result.error.code) });
    } catch {
      setPendingApproval(null);
      setActionMessage({
        tone: 'error',
        text: 'Git could not complete this action. Check the current status or ask ChatGPT for help.',
      });
    } finally {
      setBusyAction('');
      setSyncExecutionFrom(null);
    }
  }, [refreshSnapshot]);

  const handleApprovalDecision = useCallback(async (decision: 'approve' | 'deny'): Promise<void> => {
    const pending = pendingApproval;
    if (!pending || approvalResponding.current) return;
    approvalResponding.current = true;
    setApprovalDecisionBusy(decision);
    try {
      const result = await window.sudD.approval.respond({
        approvalRequestId: pending.approvalRequestId,
        decision,
      });
      if (!result.ok) {
        setPendingApproval(null);
        setActionMessage({
          tone: 'error',
          text: 'Approval could not be completed. Run the Git action again.',
        });
        return;
      }
      if (decision !== 'approve' || result.value.status !== 'approved') {
        setPendingApproval(null);
        setActionMessage({ tone: 'warning', text: 'Git action denied.' });
        return;
      }

      setPendingApproval(null);
      await handleMutationResult(pending.action, pending.request, {
        ...(pending.beforeHeadSha ? { beforeHeadSha: pending.beforeHeadSha } : {}),
        announceSyncStart: pending.action === 'sync',
      });
    } catch {
      setPendingApproval(null);
      setActionMessage({
        tone: 'error',
        text: 'Approval could not be completed. Run the Git action again.',
      });
    } finally {
      approvalResponding.current = false;
      setApprovalDecisionBusy('');
    }
  }, [handleMutationResult, pendingApproval]);

  const interactionLocked = Boolean(busyAction || pendingApproval || approvalDecisionBusy);

  const handleBranchSwitch = (branchName: string): void => {
    if (!snapshot || !branchName || branchName === snapshot.currentBranch || interactionLocked) return;
    void handleMutationResult('switch', () => window.sudD.git.switch({
      expectedSnapshotId: snapshot.snapshotId,
      branchName,
    }));
  };

  const repositoryReady = snapshot?.repository === 'ready';
  const relationCopy = snapshot
    ? syncExecutionFrom
      ? presentGitRevisionFeedback({ kind: 'updating', headSha: syncExecutionFrom })
      : presentGitRevisionFeedback({
          kind: 'status',
          relation: snapshot.relation,
          ...(snapshot.headSha ? { headSha: snapshot.headSha } : {}),
        })
    : 'Needs attention';
  const relationTone = syncExecutionFrom
    ? 'info'
    : snapshot ? gitRelationTone(snapshot.relation) : 'warning';
  const attentionCopy = snapshot ? gitAttentionCopy(snapshot) : '';
  const canGetLatest = Boolean(
    snapshot
    && snapshot.operations.sync.available
    && !['no_upstream', 'diverged', 'unavailable'].includes(snapshot.relation),
  );
  const canCommitAndPush = Boolean(
    snapshot
    && snapshot.operations.push.available
    && !['remote_ahead', 'diverged', 'unavailable'].includes(snapshot.relation),
  );

  return (
    <div className="git-page">
      <div className="page-header git-page-header">
        <div>
          <h1 className="page-title">Git</h1>
          <p className="page-subtitle">Keep the active Workspace in sync with GitHub.</p>
        </div>
      </div>

      {loadError && (
        <div className="git-action-message git-action-error" role="alert">
          <span>{loadError}</span>
          <button className="btn btn-ghost" disabled={loading} onClick={() => void refreshSnapshot()}>
            {loading ? 'Checking…' : 'Try again'}
          </button>
        </div>
      )}

      {actionMessage && (
        <div role="alert" className={`git-action-message git-action-${actionMessage.tone}`}>
          <span>{actionMessage.text}</span>
          {pendingApproval && (
            <div className="git-approval-actions">
              <button
                className="btn btn-primary"
                disabled={Boolean(approvalDecisionBusy)}
                onClick={() => void handleApprovalDecision('approve')}
              >
                {approvalDecisionBusy === 'approve' ? 'Approving…' : 'Approve'}
              </button>
              <button
                className="btn btn-ghost"
                disabled={Boolean(approvalDecisionBusy)}
                onClick={() => void handleApprovalDecision('deny')}
              >
                {approvalDecisionBusy === 'deny' ? 'Denying…' : 'Deny'}
              </button>
            </div>
          )}
        </div>
      )}

      {loading && !snapshot ? (
        <section className="card git-routine-card">
          <div className="empty-state">Reading Git state…</div>
        </section>
      ) : snapshot && repositoryReady ? (
        <section className="card git-routine-card" aria-label="Git status and actions">
          <div className="git-context-grid">
            <div className="git-context-item">
              <span className="git-context-label">Workspace</span>
              <strong>{snapshot.workspace.displayName}</strong>
            </div>
            <div className="git-context-item">
              <label className="git-context-label" htmlFor="git-branch-select">Branch</label>
              <select
                id="git-branch-select"
                className="input git-branch-select"
                value={snapshot.currentBranch ?? ''}
                disabled={snapshot.detached || !snapshot.operations.switchBranch.available || interactionLocked}
                title={!snapshot.operations.switchBranch.available ? 'Branch switching is unavailable while Git needs attention.' : undefined}
                onChange={(event) => handleBranchSwitch(event.target.value)}
              >
                {!snapshot.currentBranch && <option value="">Needs attention</option>}
                {snapshot.branches
                  .filter((branch) => branch.current || !branch.checkedOutElsewhere)
                  .map((branch) => <option key={branch.name} value={branch.name}>{branch.name}</option>)}
              </select>
            </div>
          </div>

          <div className="git-status-list" aria-label="Current Git status">
            <GitStatusLine
              tone={snapshot.primaryRemote.state === 'resolved' ? 'success' : 'warning'}
              text={snapshot.primaryRemote.state === 'resolved' ? 'GitHub connected' : 'Needs attention'}
            />
            <GitStatusLine tone={relationTone} text={relationCopy} />
            <GitStatusLine
              tone={snapshot.clean ? 'neutral' : 'info'}
              label="Local changes"
              text={localChangesCopy(snapshot.changedFiles)}
            />
          </div>

          {attentionCopy && <p className="git-attention-copy" role="status">{attentionCopy}</p>}

          <div className="git-routine-actions">
            <button
              className="btn btn-ghost"
              disabled={!canGetLatest || interactionLocked}
              onClick={() => void handleMutationResult(
                'sync',
                () => window.sudD.git.sync({ expectedSnapshotId: snapshot.snapshotId }),
                snapshot.headSha ? { beforeHeadSha: snapshot.headSha } : {},
              )}
            >
              {busyAction === 'sync' ? 'Getting latest…' : 'Get latest'}
            </button>
            <button
              className="btn btn-primary"
              disabled={!canCommitAndPush || interactionLocked}
              onClick={() => void handleMutationResult('push', () => window.sudD.git.push({ expectedSnapshotId: snapshot.snapshotId }))}
            >
              {busyAction === 'push' ? 'Committing & pushing…' : 'Commit & Push'}
            </button>
          </div>

          <p className="git-chat-hint">Need a new branch or Git setup? Ask ChatGPT.</p>
        </section>
      ) : snapshot ? (
        <section className="card git-routine-card" aria-label="Git setup status">
          <div className="git-context-item">
            <span className="git-context-label">Workspace</span>
            <strong>{snapshot.workspace.displayName}</strong>
          </div>
          <div className="git-status-list">
            <GitStatusLine tone="warning" text="Needs attention" />
          </div>
          <p className="git-attention-copy">
            {snapshot.repository === 'not_repository'
              ? 'This Workspace is not set up for Git yet.'
              : 'This Git repository is not in a supported state.'}
          </p>
          <p className="git-chat-hint">Need a new branch or Git setup? Ask ChatGPT.</p>
        </section>
      ) : (
        <section className="card git-routine-card">
          <div className="empty-state">Select an active Workspace to use Git.</div>
        </section>
      )}
    </div>
  );
}

function GitStatusLine({
  tone,
  text,
  label,
}: {
  readonly tone: 'success' | 'warning' | 'info' | 'neutral';
  readonly text: string;
  readonly label?: string;
}): React.ReactElement {
  return (
    <div className={`git-status-line git-status-${tone}`} aria-label={label}>
      <span className="git-status-dot" aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}

function gitRelationTone(relation: DesktopGitSnapshotDto['relation']): 'success' | 'warning' | 'info' | 'neutral' {
  if (relation === 'up_to_date') return 'success';
  if (relation === 'local_ahead' || relation === 'remote_ahead') return 'info';
  if (relation === 'no_upstream') return 'neutral';
  return 'warning';
}

function localChangesCopy(count: number): string {
  if (count === 0) return 'No local changes';
  return `${count} local change${count === 1 ? '' : 's'}`;
}

function gitAttentionCopy(snapshot: DesktopGitSnapshotDto): string {
  if (snapshot.detached) return 'This Workspace is not on a normal branch. Ask ChatGPT to fix it.';
  if (snapshot.primaryRemote.state !== 'resolved') return 'Git setup needs attention. Ask ChatGPT to fix it.';
  if (snapshot.repositoryState !== 'normal') return 'Finish the current Git operation before syncing.';
  if (snapshot.truncated) return 'There are too many local changes to handle safely at once.';
  if (snapshot.authStatus === 'failed') return 'GitHub sign-in needs attention on this computer.';
  if (snapshot.relation === 'diverged') return 'Local and GitHub changes need manual help before syncing.';
  if (snapshot.relation === 'remote_ahead') return 'Get latest before Commit & Push.';
  if (snapshot.relation === 'no_upstream') return 'Commit & Push once to publish this branch before getting latest changes.';
  if (snapshot.relation === 'unknown' || snapshot.relation === 'unavailable') return 'Git status needs attention before syncing.';
  return '';
}

function gitErrorCopy(code: string): string {
  switch (code) {
    case 'GIT_DIVERGED':
      return 'Local and GitHub changes need manual help before syncing.';
    case 'GIT_REMOTE_AHEAD':
      return 'Changes are available on GitHub. Get latest before pushing.';
    case 'GIT_UPSTREAM_MISSING':
      return 'This branch needs its first Commit & Push before Get latest.';
    case 'GIT_AUTH_FAILED':
      return 'GitHub sign-in needs attention on this computer.';
    case 'GIT_REMOTE_UNREACHABLE':
      return 'GitHub could not be reached. Check the network and try again.';
    case 'SENSITIVE_RESOURCE':
      return 'Some local changes need attention before they can be sent to GitHub.';
    case 'RESOURCE_TOO_LARGE':
      return 'There are too many local changes to handle safely at once.';
    case 'RESOURCE_TYPE_UNSUPPORTED':
      return 'Some local changes cannot be handled by the normal Git flow.';
    case 'GIT_REMOTE_MISSING':
    case 'GIT_REMOTE_AMBIGUOUS':
    case 'GIT_REMOTE_UNSUPPORTED':
      return 'Git setup needs attention. Ask ChatGPT to fix it.';
    case 'GIT_STATE_UNSAFE':
    case 'GIT_OPERATION_CONFLICT':
    case 'GIT_WORKTREE_DIRTY':
    case 'GIT_BRANCH_IN_USE':
      return 'Git needs attention before this action can continue.';
    default:
      return 'Git could not complete this action. Check the current status or ask ChatGPT for help.';
  }
}

function gitSuccessMessage(action: string, beforeHeadSha?: string, afterHeadSha?: string): string {
  if (action === 'sync') {
    if (!beforeHeadSha) return 'Up to date.';
    return presentGitRevisionFeedback({
      kind: 'sync_success',
      beforeHeadSha,
      ...(afterHeadSha ? { afterHeadSha } : {}),
    });
  }
  if (action === 'push') return 'Committed and pushed.';
  if (action === 'switch') return 'Branch changed.';
  return 'Git action completed.';
}
