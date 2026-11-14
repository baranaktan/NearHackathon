import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { ArrowLeft, MoreHorizontal } from 'lucide-react';
import { cn } from '../lib/cn';
import { Logo } from '../brand/Logo';
import { ThemeToggle } from '../components/ThemeToggle';
import { Sheet } from '../ui/Dialog';
import { Skeleton } from '../ui/Feedback';
import { NetworkBadge } from './NetworkBadge';
import { ALL_ITEMS, NAV_GROUPS, PRIMARY_MOBILE, SETTINGS_ITEM, type NavItem } from './nav';
import { PreviewBanner } from '../preview-fixtures/PreviewBanner';

function SideLink({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cn(
          'group relative flex h-10 items-center gap-3 rounded-md pl-3 pr-2 text-[14px] transition-colors',
          isActive ? 'bg-surface-2 text-fg' : 'text-fg-muted hover:bg-surface-2/60 hover:text-fg',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span aria-hidden className="absolute -left-3 top-2 bottom-2 w-[3px] rounded-r-sm bg-accent-text" />}
          <Icon aria-hidden className={cn('size-4 shrink-0', isActive ? 'text-accent-text' : 'text-fg-faint group-hover:text-fg-muted')} />
          <span className="truncate">{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

function Sidebar() {
  return (
    <div className="hidden w-[248px] shrink-0 border-r border-line lg:block">
    <aside className="sticky top-0 flex h-dvh flex-col">
      <div className="flex h-16 items-center px-6">
        <Link to="/" className="rounded-md text-fg" aria-label="Perde home">
          <Logo size={24} accentMark />
        </Link>
      </div>
      <nav aria-label="App" className="flex-1 overflow-y-auto px-3 pb-4 pt-2">
        {NAV_GROUPS.map((g) => (
          <div key={g.label} className="mb-6">
            <p className="mb-1.5 px-3 text-[10.5px] font-medium uppercase tracking-[0.16em] text-fg-faint">{g.label}</p>
            <ul className="space-y-0.5">
              {g.items.map((i) => (
                <li key={i.to}>
                  <SideLink item={i} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="space-y-3 border-t border-line px-3 py-4">
        <SideLink item={SETTINGS_ITEM} />
        <div className="flex items-center justify-between gap-2 pl-3">
          <NetworkBadge />
          <ThemeToggle />
        </div>
      </div>
    </aside>
    </div>
  );
}

function MobileTopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-line bg-bg/90 px-4 backdrop-blur-md lg:hidden">
      <Link to="/" className="rounded-md text-fg" aria-label="Perde home">
        <Logo size={22} accentMark />
      </Link>
      <div className="flex items-center gap-1">
        <NetworkBadge compact />
        <ThemeToggle />
      </div>
    </header>
  );
}

function MobileTabBar() {
  const [moreOpen, setMoreOpen] = useState(false);
  const { pathname } = useLocation();
  const primary = ALL_ITEMS.filter((i) => PRIMARY_MOBILE.includes(i.to));
  const rest = ALL_ITEMS.filter((i) => !PRIMARY_MOBILE.includes(i.to));
  const moreActive = rest.some((i) => pathname.startsWith(i.to));


  const tab = 'relative flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium';
  return (
    <>
      <nav aria-label="App" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 pb-safe backdrop-blur-md lg:hidden">
        <ul className="flex h-16">
          {primary.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.to} className="flex flex-1">
                <NavLink to={item.to} className={({ isActive }) => cn(tab, isActive ? 'text-fg' : 'text-fg-muted')}>
                  {({ isActive }) => (
                    <>
                      {isActive && <span aria-hidden className="absolute inset-x-6 top-0 h-[3px] rounded-b-sm bg-accent-text" />}
                      <Icon aria-hidden className={cn('size-5', isActive && 'text-accent-text')} />
                      {item.short ?? item.label}
                    </>
                  )}
                </NavLink>
              </li>
            );
          })}
          <li className="flex flex-1">
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className={cn(tab, moreActive ? 'text-fg' : 'text-fg-muted')}
            >
              {moreActive && <span aria-hidden className="absolute inset-x-6 top-0 h-[3px] rounded-b-sm bg-accent-text" />}
              <MoreHorizontal aria-hidden className={cn('size-5', moreActive && 'text-accent-text')} />
              More
            </button>
          </li>
        </ul>
      </nav>
      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More" side="bottom">
        <ul className="-mx-2 space-y-1">
          {rest.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) =>
                    cn('flex min-h-14 items-center gap-4 rounded-lg px-3', isActive ? 'bg-surface-2 text-fg' : 'text-fg hover:bg-surface-2')
                  }
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-surface-2">
                    <Icon aria-hidden className="size-4 text-fg-muted" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-medium">{item.label}</span>
                    <span className="block truncate text-[13px] text-fg-muted">{item.description}</span>
                  </span>
                </NavLink>
              </li>
            );
          })}
          <li className="pt-2">
            <Link to="/" onClick={() => setMoreOpen(false)} className="flex min-h-12 items-center gap-2 rounded-lg px-3 text-[14px] text-fg-muted hover:text-fg">
              <ArrowLeft aria-hidden className="size-4" />
              About Perde
            </Link>
          </li>
        </ul>
      </Sheet>
    </>
  );
}

function PageFallback() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading page">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-11 w-64" />
      <Skeleton className="mt-8 h-56 w-full" />
    </div>
  );
}

export function AppLayout() {
  const location = useLocation();
  useEffect(() => {
    const item = ALL_ITEMS.find((i) => location.pathname.startsWith(i.to));
    document.title = item ? `${item.label} · Perde` : 'Perde';
  }, [location.pathname]);

  return (
    <div className="flex min-h-dvh bg-bg">
      <a
        href="#/"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('app-main')?.focus();
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2"
      >
        Skip to content
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar />
        <PreviewBanner />
        <main id="app-main" tabIndex={-1} className="flex-1 outline-none">
          <div className="mx-auto w-full max-w-[960px] px-4 pb-32 pt-8 sm:px-8 sm:pt-12 lg:pb-20">
            <Suspense fallback={<PageFallback />}>
              {/* Keyed so switching preview states (?state=) remounts the page. */}
              <div key={location.pathname + location.search}>
                <Outlet />
              </div>
            </Suspense>
          </div>
        </main>
      </div>
      <MobileTabBar />
    </div>
  );
}
