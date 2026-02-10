import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState, useMemo } from 'react';
import { api } from './api';

const navSections = [
  {
    title: 'Dashboard',
    items: [
      { to: 'dashboard', label: 'Dashboard' },
    ],
  },
  {
    title: 'Center',
    items: [
      { to: 'instance', label: 'Instance' },
      { to: 'bridge', label: 'Bridge Transfers' },
    ],
  },
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
      { to: 'services/exported', label: 'Exported Services' },
      { to: 'executions', label: 'Executions' },
      { to: 'webhook-security', label: 'Webhook Security' },
      { to: 'circuit-breakers', label: 'Circuit Breakers' },
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
    title: 'Executions',
    items: [
      { to: 'callbacks', label: 'Callbacks' },
    ],
  },
  {
    title: 'System',
    items: [
      { to: 'security', label: 'Security Overview' },
      { to: 'rate-limits', label: 'Rate Limits' },
      { to: 'requests', label: 'Requests' },
      { to: 'audit', label: 'Audit Log' },
      { to: 'metrics', label: 'Metrics' },
      { to: 'data-retention', label: 'Data Retention' },
      { to: 'config', label: 'Settings' },
    ],
  },
];

function getSectionKeyForPath(pathname) {
  const pathNorm = pathname.replace(/^\/+/, '') || 'dashboard';
  const section = navSections.find((s) =>
    s.items.some((it) => pathNorm === it.to || pathNorm.startsWith(it.to + '/')));
  return section?.title ?? navSections[0].title;
}

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const initialOpen = useMemo(() => getSectionKeyForPath(location.pathname), []);
  const [expandedSections, setExpandedSections] = useState(() => new Set([initialOpen]));

  useEffect(() => {
    const key = getSectionKeyForPath(location.pathname);
    setExpandedSections((prev) => (prev.has(key) ? prev : new Set([...prev, key])));
  }, [location.pathname]);

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

  const toggleSection = (title) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };

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
          {navSections.map((section) => {
            const isExpanded = expandedSections.has(section.title);
            return (
              <div key={section.title} className={`nav-section nav-dropdown ${isExpanded ? 'nav-dropdown-open' : ''}`}>
                <button
                  type="button"
                  className="nav-section-title nav-dropdown-trigger"
                  onClick={() => toggleSection(section.title)}
                  aria-expanded={isExpanded}
                  aria-controls={`nav-section-${section.title.replace(/\s+/g, '-')}`}
                >
                  <span>{section.title}</span>
                  <span className="nav-dropdown-chevron" aria-hidden>▼</span>
                </button>
                <div
                  id={`nav-section-${section.title.replace(/\s+/g, '-')}`}
                  className="nav-section-items nav-dropdown-panel"
                  role="region"
                  aria-label={section.title}
                >
                  {section.items.map(({ to, label }) => (
                    <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'active' : '')} onClick={closeMenu}>{label}</NavLink>
                  ))}
                  {section.title === 'System' && (
                    <button type="button" onClick={handleLogout} className="nav-logout-btn">Logout</button>
                  )}
                </div>
              </div>
            );
          })}
        </nav>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
