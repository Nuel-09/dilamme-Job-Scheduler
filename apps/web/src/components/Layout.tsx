import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useSseStatus } from '../context/JobEventsContext';

const NAV_ITEMS: Array<{ to: string; label: string; end?: boolean }> = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/jobs', label: 'Jobs' },
  { to: '/create', label: 'Create Job' },
  { to: '/dlq', label: 'Dead Letter Queue' },
];

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  isActive
    ? 'bg-accent/15 text-accent ring-1 ring-accent/30'
    : 'text-muted hover:bg-surface-2 hover:text-text';

export default function Layout({ children }: { children: ReactNode }) {
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const sseConnected = useSseStatus();
  const showLabels = mobileOpen || desktopOpen;

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  return (
    <div className="flex min-h-screen bg-bg">
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border bg-surface p-4 transition-all duration-300 ease-in-out md:static md:shrink-0 md:translate-x-0 ${
          mobileOpen ? 'translate-x-0 w-64' : '-translate-x-full w-64'
        } ${desktopOpen ? 'md:w-64' : 'md:w-[4.5rem]'}`}
      >
        <div className={`flex items-center gap-3 ${showLabels ? '' : 'md:justify-center'}`}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white shadow-lg shadow-accent/25">
            JS
          </div>
          {showLabels && (
            <div className="min-w-0 md:block">
              <h1 className="truncate text-base font-semibold">Job Scheduler</h1>
              <p className="text-xs text-muted">Stage 9 · Dilamme</p>
            </div>
          )}
        </div>

        <nav className={`mt-8 flex flex-1 flex-col gap-1 ${showLabels ? '' : 'md:items-center'}`}>
          {NAV_ITEMS.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={!showLabels ? label : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${navLinkClass({ isActive })} ${showLabels ? '' : 'md:justify-center md:px-2'}`
              }
            >
              <NavIcon route={to} />
              {showLabels && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className={`mt-auto space-y-3 border-t border-border pt-4 ${showLabels ? '' : 'md:flex md:flex-col md:items-center'}`}>
          <div className="flex items-center gap-2 text-xs" title={sseConnected ? 'Live updates connected' : 'Reconnecting…'}>
            <span className={`h-2 w-2 rounded-full ${sseConnected ? 'bg-completed animate-pulse' : 'bg-pending'}`} />
            {showLabels && <span className="text-muted">{sseConnected ? 'Live (SSE)' : 'Reconnecting…'}</span>}
          </div>
          <Link
            to="/docs"
            className="text-sm text-muted transition-colors hover:text-accent"
            onClick={(e) => {
              e.preventDefault();
              window.open('/docs', '_blank');
            }}
            title="API Docs"
          >
            {showLabels ? 'API Docs ↗' : '↗'}
          </Link>
        </div>

        <button
          type="button"
          aria-label={desktopOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          className="absolute -right-3 top-6 hidden h-6 w-6 items-center justify-center rounded-full border border-border bg-surface-2 text-xs text-muted shadow-md hover:text-text md:flex"
          onClick={() => setDesktopOpen((v) => !v)}
        >
          {desktopOpen ? '‹' : '›'}
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-surface/90 px-4 py-3 backdrop-blur md:hidden">
          <button
            type="button"
            aria-label="Open menu"
            className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
            onClick={() => setMobileOpen(true)}
          >
            ☰ Menu
          </button>
          <span className="text-sm font-medium">Job Scheduler</span>
          <span
            className={`h-2.5 w-2.5 rounded-full ${sseConnected ? 'bg-completed' : 'bg-pending'}`}
          />
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

function NavIcon({ route }: { route: string }) {
  const icons: Record<string, string> = {
    '/': '◫',
    '/jobs': '☰',
    '/create': '＋',
    '/dlq': '!',
  };
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center text-base leading-none opacity-80">
      {icons[route] ?? '•'}
    </span>
  );
}
