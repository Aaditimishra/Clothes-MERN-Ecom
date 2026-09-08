import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

import { useSession } from '../lib/session';
import { disableAlerts, enableAlerts, type AlertState } from '../lib/activity';
import { ACCENT_PRESETS, useAccent, useTheme, type ThemeChoice } from '../lib/theme';

/**
 * The menu.
 *
 * Derived from permissions, so a merchandiser never sees a Settings link that
 * would 403 on click. Hiding beats disabling: a greyed-out link still tells
 * somebody the feature exists and invites a support ticket about it.
 */
export interface NavEntry {
  to: string;
  label: string;
  permission: string;
  group: string;
  /** A single-path SVG glyph, 24×24. */
  icon: string;
  /** Which live count, if any, rides on this item. */
  badge?: 'notifications' | 'payments';
}

export const NAV: NavEntry[] = [
  {
    to: '/',
    label: 'Dashboard',
    permission: 'order.view',
    group: 'Overview',
    icon: 'M3 13h8V3H3v10Zm10 8h8V11h-8v10ZM3 21h8v-6H3v6Zm10-12h8V3h-8v6Z',
  },
  {
    // No permission gate: the feed itself is filtered, so everyone sees their own.
    to: '/notifications',
    label: 'Notifications',
    permission: '*',
    group: 'Overview',
    icon: 'M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 21a2 2 0 0 1-3.4 0',
    badge: 'notifications',
  },
  {
    to: '/products',
    label: 'Products',
    permission: 'catalog.view',
    group: 'Catalogue',
    icon: 'M20 7 12 3 4 7v10l8 4 8-4V7ZM4 7l8 4 8-4M12 11v10',
  },
  {
    to: '/categories',
    label: 'Categories',
    permission: 'catalog.view',
    group: 'Catalogue',
    icon: 'M3 5h7v7H3V5Zm11 0h7v7h-7V5ZM3 16h7v3H3v-3Zm11 0h7v3h-7v-3Z',
  },
  {
    to: '/taxonomy',
    label: 'Attributes & brands',
    permission: 'catalog.view',
    group: 'Catalogue',
    icon: 'M4 6h16M4 12h10M4 18h7',
  },
  {
    to: '/size-charts',
    label: 'Size charts',
    permission: 'catalog.view',
    group: 'Catalogue',
    icon: 'M3 8h18v8H3V8Zm3 0v4m3-4v6m3-6v4m3-4v6m3-6v4',
  },
  {
    to: '/media',
    label: 'Media',
    permission: 'catalog.view',
    group: 'Catalogue',
    icon: 'M3 5h18v14H3V5Zm0 10 5-4 4 3 3-3 6 5M8.5 9.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z',
  },
  {
    to: '/content',
    label: 'Journal & pages',
    permission: 'catalog.view',
    group: 'Catalogue',
    icon: 'M5 3h14v18l-7-4-7 4V3Zm4 5h6M9 12h6',
  },
  {
    to: '/orders',
    label: 'Orders',
    permission: 'order.view',
    group: 'Sales',
    icon: 'M6 2h9l5 5v15H6V2Zm9 0v5h5M9 13h8M9 17h5',
  },
  {
    to: '/payments',
    label: 'Payments',
    permission: 'order.view',
    group: 'Sales',
    icon: 'M2 7h20v10H2V7Zm0 4h20M6 15h4',
    badge: 'payments',
  },
  {
    to: '/customers',
    label: 'Customers',
    permission: 'customer.view',
    group: 'Sales',
    icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9a8 8 0 0 1 16 0',
  },
  {
    to: '/coupons',
    label: 'Coupons',
    permission: 'promotion.manage',
    group: 'Sales',
    icon: 'M3 9V6h18v3a3 3 0 0 0 0 6v3H3v-3a3 3 0 0 0 0-6Zm11-3v12',
  },
  {
    to: '/reviews',
    label: 'Reviews',
    permission: 'review.moderate',
    group: 'Sales',
    icon: 'm12 3 2.9 5.9 6.6 1-4.8 4.6 1.2 6.5L12 18l-5.9 3 1.2-6.5L2.5 9.9l6.6-1L12 3Z',
  },
  {
    to: '/settings',
    label: 'Store settings',
    permission: 'settings.manage',
    group: 'Configure',
    icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8-3a8 8 0 0 0-.2-1.7l2-1.6-2-3.4-2.4 1a8 8 0 0 0-2.9-1.7L14 2h-4l-.5 2.6a8 8 0 0 0-2.9 1.7l-2.4-1-2 3.4 2 1.6a8 8 0 0 0 0 3.4l-2 1.6 2 3.4 2.4-1a8 8 0 0 0 2.9 1.7L10 22h4l.5-2.6a8 8 0 0 0 2.9-1.7l2.4 1 2-3.4-2-1.6c.13-.55.2-1.12.2-1.7Z',
  },
  {
    to: '/staff',
    label: 'Staff',
    permission: 'staff.manage',
    group: 'Configure',
    icon: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-7 9a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M18 20a6 6 0 0 0-2-4.5',
  },
  {
    to: '/emails',
    label: 'Emails',
    permission: 'settings.manage',
    group: 'Configure',
    icon: 'M3 6h18v12H3V6Zm0 1 9 6 9-6',
  },
];

const GROUP_ORDER = ['Overview', 'Catalogue', 'Sales', 'Configure'];

const CLOSED_KEY = 'threadline.admin.nav.closed';

const Icon = ({ path }: { path: string }) => (
  <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d={path} />
  </svg>
);

const THEMES: Array<{ id: ThemeChoice; label: string }> = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System' },
];

export const Sidebar = ({
  isOpen,
  isRail,
  onToggleRail,
  onNavigate,
  badges,
  alerts,
  onAlerts,
}: {
  isOpen: boolean;
  isRail: boolean;
  onToggleRail: () => void;
  onNavigate: () => void;
  badges: { notifications: number; payments: number };
  alerts: AlertState;
  onAlerts: (next: AlertState) => void;
}) => {
  const { session, signOut, can } = useSession();
  const { pathname } = useLocation();
  const [theme, setTheme] = useTheme();
  const [accent, setAccent] = useAccent();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // A click anywhere else closes the menu. Without it the panel stays open over
  // the nav and swallows the next link someone aims at.
  useEffect(() => {
    if (!profileOpen) return;
    const onDown = (event: MouseEvent) => {
      if (!profileRef.current?.contains(event.target as Node)) setProfileOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProfileOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [profileOpen]);

  useEffect(() => setProfileOpen(false), [pathname]);

  const visible = NAV.filter(
    (entry) => entry.permission === '*' || can(entry.permission),
  );
  const groups = GROUP_ORDER.map((title) => ({
    title,
    items: visible.filter((entry) => entry.group === title),
  })).filter((group) => group.items.length > 0);

  /**
   * Which groups are folded, remembered between sessions.
   *
   * Stored as the CLOSED set rather than the open one, so a group added later
   * appears open by default — storing the open set would silently hide every
   * new section from everyone who had used the panel before.
   */
  const [closed, setClosed] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(CLOSED_KEY);
      return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set<string>();
    }
  });

  const toggleGroup = (title: string) => {
    setClosed((current) => {
      const next = new Set(current);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      try {
        localStorage.setItem(CLOSED_KEY, JSON.stringify([...next]));
      } catch {
        // Folds still work for this session; they just will not be remembered.
      }
      return next;
    });
  };

  /** Is the page you are on inside this group? */
  const holdsCurrent = (items: NavEntry[]): boolean =>
    items.some((entry) =>
      entry.to === '/' ? pathname === '/' : pathname.startsWith(entry.to),
    );

  const countFor = (entry: NavEntry): number =>
    entry.badge === 'notifications'
      ? badges.notifications
      : entry.badge === 'payments'
        ? badges.payments
        : 0;

  const initials = (session?.staff.name ?? '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <aside className={`sidebar${isOpen ? ' is-open' : ''}`}>
      <div className="sidebar-brandbar">
        <NavLink to="/" className="sidebar-brand" onClick={onNavigate}>
          <span className="brand-mark">T</span>
          <span className="brand-text">
            <strong>Threadline</strong>
            <span>Admin</span>
          </span>
        </NavLink>

        {/* Collapses the sidebar to a strip of icons. Hidden on narrow screens,
            where it is already an overlay and a rail would mean nothing. */}
        <button
          type="button"
          className="rail-toggle"
          onClick={onToggleRail}
          aria-label={isRail ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-pressed={isRail}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 5h16M4 12h16M4 19h16" />
            <path d={isRail ? 'm13 9 3 3-3 3' : 'm11 9-3 3 3 3'} />
          </svg>
        </button>
      </div>

      <nav className="nav" aria-label="Sections">
        {groups.map((group) => {
          // A folded group that contains the current page would hide where you
          // are, so it is treated as open regardless of the stored preference.
          const isOpen = !closed.has(group.title) || holdsCurrent(group.items);
          const hidden = group.items.reduce((sum, entry) => sum + countFor(entry), 0);

          return (
            <div key={group.title} className={`nav-group${isOpen ? '' : ' is-closed'}`}>
              {/*
              The heading is the control. A separate chevron button would be a
              second finger-sized target for something the whole row can do.
            */}
              <button
                type="button"
                className="nav-heading"
                onClick={() => toggleGroup(group.title)}
                aria-expanded={isOpen}
              >
                <span>{group.title}</span>
                {/* Work inside a folded group still shows, or a fold hides it. */}
                {!isOpen && hidden > 0 ? (
                  <span className="nav-badge">{hidden}</span>
                ) : null}
                <svg className="nav-chev" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              <div className="nav-items">
                {/*
                  Two elements, not one. `0fr` collapses a grid's single row —
                  with the links as direct children the grid makes one row EACH
                  and only the first collapses, which folds away one link and
                  leaves the rest on screen.
                */}
                <div className="nav-items-inner">
                  {group.items.map((entry) => {
                    const count = countFor(entry);
                    return (
                      <NavLink
                        key={entry.to}
                        to={entry.to}
                        end={entry.to === '/'}
                        onClick={onNavigate}
                        className="nav-link"
                        /* In rail mode the label is gone, so the tooltip is the only
                     thing naming the icon. */
                        title={entry.label}
                      >
                        <Icon path={entry.icon} />
                        <span className="nav-label">{entry.label}</span>
                        {count > 0 ? <span className="nav-badge">{count}</span> : null}
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </nav>

      {/* Account, theme and sign out. In the sidebar rather than the header so
          it stays put while the content area scrolls. */}
      <div className="profile" ref={profileRef}>
        <button
          type="button"
          className="profile-trigger"
          onClick={() => setProfileOpen((open) => !open)}
          aria-expanded={profileOpen}
          aria-haspopup="menu"
          title={session?.staff.name}
        >
          <span className="profile-avatar">{initials}</span>
          <span className="profile-who">
            <strong>{session?.staff.name}</strong>
            <span>{session?.staff.role}</span>
          </span>
          <svg className="profile-chev" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 15 6-6 6 6" />
          </svg>
        </button>

        {profileOpen ? (
          <div className="profile-menu" role="menu">
            <div className="profile-menu-head">
              <strong>{session?.staff.name}</strong>
              <span>{session?.staff.email}</span>
            </div>

            <div className="profile-section">
              <span className="profile-section-title">Appearance</span>
              <div className="segmented" role="group" aria-label="Theme">
                {THEMES.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`segmented-option${theme === option.id ? ' is-on' : ''}`}
                    aria-pressed={theme === option.id}
                    onClick={() => setTheme(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="profile-section">
              <span className="profile-section-title">Accent colour</span>
              {/*
                This operator's own, not the shop's. Two people sharing a shop
                should be able to tell their windows apart, and neither should be
                able to recolour the panel for the other. "Store brand" hands it
                back to whatever Settings says.
              */}
              <div className="swatches" role="group" aria-label="Accent colour">
                {ACCENT_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={`swatch${accent === preset.id ? ' is-on' : ''}${
                      preset.colour ? '' : ' is-store'
                    }`}
                    style={preset.colour ? { background: preset.colour } : undefined}
                    aria-label={preset.label}
                    aria-pressed={accent === preset.id}
                    title={preset.label}
                    onClick={() => setAccent(preset.id)}
                  />
                ))}
              </div>
            </div>

            <div className="profile-section">
              <span className="profile-section-title">Desktop alerts</span>
              {/*
                Asked for on a click, never on load.
                Chrome refuses a permission prompt that did not follow a
                gesture, and prompting unasked is how a site gets blocked
                forever by somebody who was only trying to sign in.
              */}
              {alerts === 'unsupported' ? (
                <p className="profile-note">This browser cannot show them.</p>
              ) : alerts === 'blocked' ? (
                <p className="profile-note">
                  Blocked for this site. Allow notifications in your browser's site
                  settings to turn them back on.
                </p>
              ) : (
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={alerts === 'on'}
                    onChange={async (event) => {
                      if (event.target.checked) onAlerts(await enableAlerts());
                      else {
                        disableAlerts();
                        onAlerts('off');
                      }
                    }}
                  />
                  Tell me about new orders
                </label>
              )}
              <p className="profile-note">
                Only while a Threadline tab is open, in any window.
              </p>
            </div>

            <NavLink to="/profile" className="profile-item" onClick={onNavigate}>
              Your profile
            </NavLink>
            <button type="button" className="profile-item is-danger" onClick={signOut}>
              Sign out
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
};
