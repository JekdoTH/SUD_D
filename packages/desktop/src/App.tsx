import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { HomePage } from './pages/HomePage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ConnectionPage } from './pages/ConnectionPage';
import { ActivityPage } from './pages/ActivityPage';
import { SettingsPage } from './pages/SettingsPage';
import { RecoveryPage } from './pages/RecoveryPage';
import { DoctorPage } from './pages/DoctorPage';
import { TeamPage } from './pages/TeamPage';
import sudDLogo from './assets/sud-d-logo.png';
import { UiIcon, type UiIconName } from './ui-icons';

export type AppPage =
  | 'overview'
  | 'workspaces'
  | 'connection'
  | 'activity'
  | 'team'
  | 'security'
  | 'recovery'
  | 'environment';

const NAV_ITEMS: { id: AppPage; icon: UiIconName; label: string }[] = [
  { id: 'overview', icon: 'overview', label: 'Overview' },
  { id: 'workspaces', icon: 'workspaces', label: 'Workspaces' },
  { id: 'connection', icon: 'connection', label: 'Connection' },
  { id: 'activity', icon: 'activity', label: 'Activity' },
  { id: 'team', icon: 'team', label: 'Team' },
  { id: 'security', icon: 'security', label: 'Security' },
  { id: 'recovery', icon: 'recovery', label: 'Recovery' },
  { id: 'environment', icon: 'environment', label: 'Environment / Doctor' },
];

type HealthState = 'checking' | 'healthy' | 'attention';

export function App(): React.ReactElement {
  const [page, setPage] = useState<AppPage>('overview');
  const [healthState, setHealthState] = useState<HealthState>('checking');
  const [openingChatGPT, setOpeningChatGPT] = useState(false);
  const [shellMessage, setShellMessage] = useState('');

  const currentPageLabel = useMemo(
    () => NAV_ITEMS.find((item) => item.id === page)?.label ?? 'SUD-D',
    [page],
  );

  const refreshHealth = useCallback(async () => {
    try {
      const result = await window.sudD.health.check();
      setHealthState(result.ok && result.value.status === 'ok' ? 'healthy' : 'attention');
    } catch {
      setHealthState('attention');
    }
  }, []);

  useEffect(() => {
    void refreshHealth();
    const timer = window.setInterval(() => void refreshHealth(), 5000);
    return () => window.clearInterval(timer);
  }, [refreshHealth]);

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

  const healthLabel = healthState === 'healthy'
    ? 'System healthy'
    : healthState === 'checking'
      ? 'Checking system'
      : 'System needs attention';

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
            <div className={`shell-health-chip shell-health-${healthState}`} role="status">
              <span className="shell-health-dot" aria-hidden="true" />
              <span>{healthLabel}</span>
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
