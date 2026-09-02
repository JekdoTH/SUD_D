import React, { useState } from 'react';
import { HomePage } from './pages/HomePage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ConnectionPage } from './pages/ConnectionPage';
import { ActivityPage } from './pages/ActivityPage';
import { SettingsPage } from './pages/SettingsPage';
import { RecoveryPage } from './pages/RecoveryPage';
import { DoctorPage } from './pages/DoctorPage';
import { TeamPage } from './pages/TeamPage';

export type AppPage =
  | 'overview'
  | 'workspaces'
  | 'connection'
  | 'activity'
  | 'team'
  | 'security'
  | 'recovery'
  | 'environment';

const NAV_ITEMS: { id: AppPage; icon: string; label: string }[] = [
  { id: 'overview', icon: '◫', label: 'Overview' },
  { id: 'workspaces', icon: '▣', label: 'Workspaces' },
  { id: 'connection', icon: '↗', label: 'Connection' },
  { id: 'activity', icon: '≋', label: 'Activity' },
  { id: 'team', icon: '▱', label: 'Team' },
  { id: 'security', icon: '◇', label: 'Security' },
  { id: 'recovery', icon: '↶', label: 'Recovery' },
  { id: 'environment', icon: '✦', label: 'Environment / Doctor' },
];

export function App(): React.ReactElement {
  const [page, setPage] = useState<AppPage>('overview');

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-mark">S</div>
          <div>
            <div className="sidebar-logo-name">SUD-D</div>
            <div className="sidebar-logo-caption">Local AI control center</div>
          </div>
        </div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              id={`nav-${item.id}`}
              className={`nav-item${page === item.id ? ' active' : ''}`}
              onClick={() => setPage(item.id)}
            >
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="status-dot status-dot-success" />
          Local-first · Windows
        </div>
      </aside>

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
    </div>
  );
}
