import React, { useState } from 'react';
import { HomePage } from './pages/HomePage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ActivityPage } from './pages/ActivityPage';
import { SettingsPage } from './pages/SettingsPage';
import { DoctorPage } from './pages/DoctorPage';

type Page = 'home' | 'projects' | 'activity' | 'settings' | 'doctor';

const NAV_ITEMS: { id: Page; icon: string; label: string }[] = [
  { id: 'home',     icon: '⌂',  label: 'Home'     },
  { id: 'projects', icon: '◈',  label: 'Projects'  },
  { id: 'activity', icon: '≋',  label: 'Activity'  },
  { id: 'settings', icon: '⚙',  label: 'Settings'  },
  { id: 'doctor',   icon: '✦',  label: 'Doctor'    },
];

export function App(): React.ReactElement {
  const [page, setPage] = useState<Page>('home');

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-mark">S</div>
          <span className="sidebar-logo-name">SUD-D</span>
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              id={`nav-${item.id}`}
              className={`nav-item${page === item.id ? ' active' : ''}`}
              onClick={() => setPage(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main">
        {page === 'home'     && <HomePage     onNavigate={setPage} />}
        {page === 'projects' && <ProjectsPage />}
        {page === 'activity' && <ActivityPage />}
        {page === 'settings' && <SettingsPage />}
        {page === 'doctor'   && <DoctorPage   />}
      </main>
    </div>
  );
}
