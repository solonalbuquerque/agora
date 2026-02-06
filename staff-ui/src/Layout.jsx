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
      { to: 'dashboard', label: 'Dashboard' },
      { to: 'statistics', label: 'Statistics' },
      { to: 'config', label: 'Settings' },
    ],
  },
];

export default function Layout() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

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

  const closeMenu = () => setMenuOpen(false);

  if (!ready) return <div className="main">Loading…</div>;

  const staffUrl = typeof window !== 'undefined' ? `${window.location.origin}/staff` : '';

  return (
    <div className="layout">
      <button
        type="button"
        className="menu-toggle"
        onClick={() => setMenuOpen((o) => !o)}
        aria-label="Toggle menu"
        aria-expanded={menuOpen}
      >
        <span className="menu-toggle-icon">☰</span>
      </button>
      <div className={`sidebar-overlay ${menuOpen ? 'sidebar-overlay-visible' : ''}`} onClick={closeMenu} aria-hidden="true" />
      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-header">
          Staff Panel
          <button type="button" className="sidebar-close" onClick={closeMenu} aria-label="Close menu">×</button>
        </div>
        {staffUrl && (
          <div className="sidebar-url" title={staffUrl}>
            <a href={staffUrl} rel="noopener noreferrer">{staffUrl}</a>
          </div>
        )}
        <nav className="sidebar-nav">
          {navSections.map((section) => (
            <div key={section.title} className="nav-section">
              <div className="nav-section-title">{section.title}</div>
              <div className="nav-section-items">
                {section.items.map(({ to, label }) => (
                  <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'active' : '')} onClick={closeMenu}>{label}</NavLink>
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
