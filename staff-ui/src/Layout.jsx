import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from './api';

const navSections = [
  {
    title: 'Agents',
    items: [
      { to: 'agents', label: 'List Agents' },
    ],
  },
  {
    title: 'Humans',
    items: [
      { to: 'humans', label: 'List Humans' },
    ],
  },
  {
    title: 'Services',
    items: [
      { to: 'services', label: 'List Services' },
      { to: 'executions', label: 'Executions' },
    ],
  },
  {
    title: 'Financial',
    items: [
      { to: 'wallets', label: 'Balances' },
      { to: 'ledger', label: 'Transactions' },
      { to: 'coins', label: 'Coins' },
    ],
  },
  {
    title: 'Trust',
    items: [
      { to: 'trust-levels', label: 'Trust Levels' },
    ],
  },
  {
    title: 'System',
    items: [
      { to: 'config', label: 'Settings' },
    ],
  },
];

export default function Layout() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api.config()
      .then(() => setReady(true))
      .catch((e) => {
        if (e.status === 401) navigate('/login', { replace: true });
        else setReady(true);
      });
  }, [navigate]);

  const handleLogout = () => {
    api.logout().then(() => navigate('/login', { replace: true }));
  };

  if (!ready) return <div className="main">Loading…</div>;

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">Staff Panel</div>
        <nav className="sidebar-nav">
          {navSections.map((section) => (
            <div key={section.title} className="nav-section">
              <div className="nav-section-title">{section.title}</div>
              <div className="nav-section-items">
                {section.items.map(({ to, label }) => (
                  <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'active' : '')}>{label}</NavLink>
                ))}
                {section.title === 'System' && (
                  <button type="button" onClick={handleLogout} className="nav-logout-btn">Logout</button>
                )}
              </div>
            </div>
          ))}
        </nav>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
