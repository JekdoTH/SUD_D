import React, { useEffect, useMemo, useState } from 'react';
import type { DesktopUpdateStatusDto } from '@sud-d/contracts';

type UpdateNoteSection = {
  heading: 'New' | 'Improved' | 'Fixed';
  items: string[];
};

export type UpdatePresentation = {
  productVersion: string;
  revision: string;
  statusText: string;
  postUpdateSummaryTitle: string | null;
  noteSections: UpdateNoteSection[];
  primaryAction: 'download' | 'restart' | null;
  checkDisabled: boolean;
};

const ERROR_COPY: Record<NonNullable<DesktopUpdateStatusDto['errorCode']>, string> = {
  CHECK_FAILED: "Couldn't check for updates. Your current version is unchanged.",
  DOWNLOAD_FAILED: "Couldn't download the update. Your current version is unchanged.",
  VERIFY_FAILED: "Update couldn't be verified. SUD-D was not changed.",
  INSTALL_FAILED: "SUD-D couldn't start the update. Your current version is unchanged.",
};

function targetVersion(status: DesktopUpdateStatusDto): string {
  return status.targetVersion ?? status.currentVersion;
}

export function presentUpdateStatus(status: DesktopUpdateStatusDto): UpdatePresentation {
  let statusText = 'Check for updates when you’re ready.';
  if (status.phase === 'checking') statusText = 'Checking for updates…';
  if (status.phase === 'up_to_date') statusText = `You're up to date · v${status.currentVersion}`;
  if (status.phase === 'available') statusText = `Update available · v${targetVersion(status)}`;
  if (status.phase === 'downloading') {
    statusText = `Downloading v${targetVersion(status)}${status.progressPercent === null ? '' : ` · ${Math.round(status.progressPercent)}%`}`;
  }
  if (status.phase === 'verifying') statusText = 'Verifying update…';
  if (status.phase === 'ready') statusText = `v${targetVersion(status)} is ready`;
  if (status.phase === 'unavailable') statusText = 'Updates are available in the installed app.';
  if (status.phase === 'error') {
    statusText = status.errorCode ? ERROR_COPY[status.errorCode] : 'Update status is unavailable.';
  }

  const postUpdateSummaryTitle = status.targetVersion === null && status.releaseNotes !== null
    ? `Updated to v${status.currentVersion}`
    : null;

  const noteSections: UpdateNoteSection[] = [];
  if (status.releaseNotes?.new.length) noteSections.push({ heading: 'New', items: [...status.releaseNotes.new] });
  if (status.releaseNotes?.improved.length) noteSections.push({ heading: 'Improved', items: [...status.releaseNotes.improved] });
  if (status.releaseNotes?.fixed.length) noteSections.push({ heading: 'Fixed', items: [...status.releaseNotes.fixed] });

  return {
    productVersion: `SUD-D v${status.currentVersion}`,
    revision: `Revision ${status.currentRevision.slice(0, 7)}`,
    statusText,
    postUpdateSummaryTitle,
    noteSections,
    primaryAction: status.phase === 'available' ? 'download' : status.phase === 'ready' ? 'restart' : null,
    checkDisabled: ['checking', 'downloading', 'verifying', 'unavailable'].includes(status.phase),
  };
}

async function refreshAfterFailure(): Promise<DesktopUpdateStatusDto | null> {
  try {
    const refreshed = await window.sudD.update.status();
    return refreshed.ok ? refreshed.value : null;
  } catch {
    return null;
  }
}

export function UpdatePage(): React.ReactElement {
  const [status, setStatus] = useState<DesktopUpdateStatusDto | null>(null);
  const [requestBusy, setRequestBusy] = useState(false);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    let active = true;
    void window.sudD.update.status()
      .then((result) => {
        if (!active) return;
        if (result.ok) setStatus(result.value);
        else setLocalError('Update status is unavailable.');
      })
      .catch(() => {
        if (active) setLocalError('Update status is unavailable.');
      });
    return () => { active = false; };
  }, []);

  const view = useMemo(() => status ? presentUpdateStatus(status) : null, [status]);

  const runAction = async (
    action: () => Promise<{ ok: true; value: DesktopUpdateStatusDto } | { ok: false; error: { code: string; message: string } }>,
  ): Promise<void> => {
    setRequestBusy(true);
    setLocalError('');
    try {
      const result = await action();
      if (result.ok) {
        setStatus(result.value);
        return;
      }
      const refreshed = await refreshAfterFailure();
      if (refreshed) setStatus(refreshed);
      else setLocalError('Update action could not be completed. Your current version is unchanged.');
    } catch {
      const refreshed = await refreshAfterFailure();
      if (refreshed) setStatus(refreshed);
      else setLocalError('Update action could not be completed. Your current version is unchanged.');
    } finally {
      setRequestBusy(false);
    }
  };

  const restartAndInstall = async (): Promise<void> => {
    setRequestBusy(true);
    setLocalError('');
    try {
      const result = await window.sudD.update.restartAndInstall();
      if (!result.ok) {
        const refreshed = await refreshAfterFailure();
        if (refreshed) setStatus(refreshed);
        else setLocalError('SUD-D could not start the update. Your current version is unchanged.');
      }
    } catch {
      const refreshed = await refreshAfterFailure();
      if (refreshed) setStatus(refreshed);
      else setLocalError('SUD-D could not start the update. Your current version is unchanged.');
    } finally {
      setRequestBusy(false);
    }
  };

  return (
    <section className="update-page" aria-labelledby="update-page-title">
      <header className="page-header update-page-header">
        <div>
          <h1 className="page-title" id="update-page-title">Update</h1>
          <p className="page-subtitle">Keep SUD-D current without using Git or PowerShell.</p>
        </div>
      </header>

      {!view ? (
        <div className="card update-status-card" role="status">
          <strong>Reading update status…</strong>
        </div>
      ) : (
        <div className="card update-status-card">
          <div className="update-version-row">
            <div>
              <h2>{view.productVersion}</h2>
              <p className="update-revision">{view.revision}</p>
            </div>
            <span className={`status-chip update-phase-${status?.phase ?? 'idle'}`}>
              <span className="status-dot" aria-hidden="true" />
              {status?.phase.replaceAll('_', ' ') ?? 'idle'}
            </span>
          </div>

          <div
            className={`update-status-copy${status?.phase === 'error' ? ' is-error' : ''}`}
            role={status?.phase === 'error' ? 'alert' : 'status'}
          >
            {view.statusText}
          </div>

          {view.noteSections.length > 0 && (
            <section className="update-notes" aria-labelledby="update-notes-title">
              <h2 id="update-notes-title">{view.postUpdateSummaryTitle ?? <>What&apos;s new</>}</h2>
              {view.postUpdateSummaryTitle && <p className="update-summary-copy">Changes in this update</p>}
              <div className="update-note-sections">
                {view.noteSections.map((section) => (
                  <div className="update-note-section" key={section.heading}>
                    <h3>{section.heading}</h3>
                    <ul>
                      {section.items.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="update-actions">
            <button
              className="btn btn-ghost"
              disabled={requestBusy || view.checkDisabled}
              onClick={() => void runAction(() => window.sudD.update.check())}
            >
              {status?.phase === 'checking' ? 'Checking…' : 'Check for Updates'}
            </button>
            {view.primaryAction === 'download' && (
              <button
                className="btn btn-primary"
                disabled={requestBusy}
                onClick={() => void runAction(() => window.sudD.update.download())}
              >
                Download Update
              </button>
            )}
            {view.primaryAction === 'restart' && (
              <button
                className="btn btn-primary"
                disabled={requestBusy}
                onClick={() => void restartAndInstall()}
              >
                Restart &amp; Update
              </button>
            )}
          </div>

          {localError && <p className="update-local-error" role="alert">{localError}</p>}
        </div>
      )}
    </section>
  );
}
