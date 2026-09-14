import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { HomePage } from './pages/HomePage';
import { ProjectsPage } from './pages/ProjectsPage';
import { GitPage } from './pages/GitPage';
import { ConnectionPage } from './pages/ConnectionPage';
import { ActivityPage } from './pages/ActivityPage';
import { SettingsPage } from './pages/SettingsPage';
import { RecoveryPage } from './pages/RecoveryPage';
import { DoctorPage } from './pages/DoctorPage';
import { TeamPage } from './pages/TeamPage';
import sudDLogo from './assets/sud-d-logo.png';
import { UiIcon, type UiIconName } from './ui-icons';
import { presentConnectionState, type ConnectionStatePresentation } from './connection-ui-model';

export type AppPage =
  | 'overview'
  | 'workspaces'
  | 'git'
  | 'connection'
  | 'activity'
  | 'team'
  | 'security'
  | 'recovery'
  | 'environment';

const NAV_ITEMS: { id: AppPage; icon: UiIconName; label: string }[] = [
  { id: 'overview', icon: 'overview', label: 'Overview' },
  { id: 'connection', icon: 'connection', label: 'Connection' },
  { id: 'workspaces', icon: 'workspaces', label: 'Workspaces' },
  { id: 'git', icon: 'git', label: 'Git' },
  { id: 'activity', icon: 'activity', label: 'Activity' },
  { id: 'team', icon: 'team', label: 'Team' },
  { id: 'security', icon: 'security', label: 'Security' },
  { id: 'recovery', icon: 'recovery', label: 'Recovery' },
  { id: 'environment', icon: 'environment', label: 'Environment / Doctor' },
];

const CHECKING_CONNECTION_PRESENTATION: ConnectionStatePresentation = {
  label: 'Checking connection',
  description: 'Reading local connection status.',
  tone: 'neutral',
};

const CONNECTION_UNAVAILABLE_PRESENTATION: ConnectionStatePresentation = {
  label: 'Connection unavailable',
  description: 'Connection status could not be read.',
  tone: 'danger',
};

export function App(): React.ReactElement {
  const [page, setPage] = useState<AppPage>('overview');
  const [shellConnectionPresentation, setShellConnectionPresentation] = useState<ConnectionStatePresentation>(
    CHECKING_CONNECTION_PRESENTATION,
  );
  const [openingChatGPT, setOpeningChatGPT] = useState(false);
  const [shellMessage, setShellMessage] = useState('');

  const currentPageLabel = useMemo(
    () => NAV_ITEMS.find((item) => item.id === page)?.label ?? 'SUD-D',
    [page],
  );

  const refreshConnectionStatus = useCallback(async () => {
    try {
      const result = await window.sudD.connection.status();
      if (result.ok) {
        setShellConnectionPresentation(presentConnectionState(result.value.runtime.state));
        return;
      }
    } catch {
      // Fall through to the safe unavailable state below.
    }
    setShellConnectionPresentation(CONNECTION_UNAVAILABLE_PRESENTATION);
  }, []);

  useEffect(() => {
    void refreshConnectionStatus();
    const timer = window.setInterval(() => void refreshConnectionStatus(), 2000);
    return () => window.clearInterval(timer);
  }, [refreshConnectionStatus]);

  const openChatGPTWeb = async (): Promise<void> => {
    setOpeningChatGPT(true);
    setShellMessage('');
    try {
      const result = await window.sudD.app.openChatGPTWeb();
      if (!result.ok) setShellMessage(result.error.message);
    } catch {
      setShellMessage('Failed to open ChatGPT Web');
    } finally {
      setOpeningChatGPT(false);
    }
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img className="sidebar-logo-image" src={sudDLogo} alt="SUD-D — Local Agent Runtime for AI" />
        </div>

        <nav className="sidebar-nav" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              id={`nav-${item.id}`}
              className={`nav-item${page === item.id ? ' active' : ''}`}
              onClick={() => setPage(item.id)}
              aria-current={page === item.id ? 'page' : undefined}
            >
              <UiIcon name={item.icon} size={20} className="nav-icon" />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span className="status-dot status-dot-success" aria-hidden="true" />
          <span>Local-first · Windows</span>
        </div>
      </aside>

      <section className="app-stage">
        <header className="app-topbar">
          <div className="breadcrumb" aria-label="Current page">
            <UiIcon name="overview" size={18} />
            <UiIcon name="chevron-right" size={14} className="breadcrumb-chevron" />
            <span>{currentPageLabel}</span>
          </div>

          <div className="app-topbar-actions">
            <div
              className={`shell-status-chip shell-status-${shellConnectionPresentation.tone}`}
              role="status"
              aria-label={`Connection status: ${shellConnectionPresentation.label}`}
            >
              <span className="shell-status-dot" aria-hidden="true" />
              <span>{shellConnectionPresentation.label}</span>
            </div>
            <button
              id="open-chatgpt-web"
              className="btn open-chatgpt-button"
              disabled={openingChatGPT}
              onClick={() => void openChatGPTWeb()}
            >
              <UiIcon name="external-link" size={18} />
              {openingChatGPT ? 'Opening…' : 'Open ChatGPT Web'}
            </button>
          </div>
        </header>

        {shellMessage && (
          <div className="shell-message" role="alert">
            {shellMessage}
          </div>
        )}

        <main className="main">
          {page === 'overview' && <HomePage onNavigate={setPage} />}
          {page === 'workspaces' && <ProjectsPage />}
          {page === 'git' && <GitPage onNavigate={setPage} />}
          {page === 'connection' && <ConnectionPage onNavigate={setPage} />}
          {page === 'activity' && <ActivityPage />}
          {page === 'team' && <TeamPage />}
          {page === 'security' && <SettingsPage />}
          {page === 'recovery' && <RecoveryPage />}
          {page === 'environment' && <DoctorPage />}
        </main>
      </section>
    </div>
  );
}
