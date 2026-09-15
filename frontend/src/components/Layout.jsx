import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useSync } from '../context/SyncContext.jsx';
import { t, LANGUAGES } from '../i18n/strings.js';
import { alertsApi } from '../services/api.js';

const NAV_ITEMS = [
  { to: '/', key: 'nav_dashboard', icon: '📊', roles: 'all' },
  { to: '/my-journey', key: 'nav_myJourney', icon: '🚚', roles: ['admin', 'driver'] },
  { to: '/map', key: 'nav_map', icon: '🗺️', roles: 'all' },
  { to: '/route-planner', key: 'nav_routePlanner', icon: '🧭', roles: ['admin', 'logistics_manager'] },
  { to: '/vehicles', key: 'nav_vehicles', icon: '🚚', roles: ['admin', 'logistics_manager', 'driver'] },
  { to: '/shipments', key: 'nav_shipments', icon: '📦', roles: ['admin', 'logistics_manager'] },
  { to: '/incidents', key: 'nav_incidents', icon: '⚠️', roles: ['admin', 'authority_officer', 'logistics_manager', 'field_officer'] },
  { to: '/field-reporting', key: 'nav_fieldReporting', icon: '📱', roles: ['admin', 'field_officer', 'authority_officer'] },
  { to: '/alerts', key: 'nav_alerts', icon: '🔔', roles: 'all' },
  { to: '/emergency', key: 'nav_emergency', icon: '🚨', roles: ['admin', 'authority_officer', 'logistics_manager'] },
  { to: '/district-analytics', key: 'nav_districtAnalytics', icon: '📍', roles: ['admin', 'authority_officer', 'logistics_manager', 'viewer'] },
  { to: '/bottlenecks', key: 'nav_bottlenecks', icon: '🧱', roles: ['admin', 'authority_officer', 'logistics_manager', 'viewer'] },
  { to: '/weather-risk', key: 'nav_weather', icon: '🌧️', roles: 'all' },
  { to: '/admin', key: 'nav_admin', icon: '⚙️', roles: ['admin'] },
  { to: '/profile', key: 'nav_profile', icon: '👤', roles: 'all' }
];

const SYNC_COLORS = { ONLINE: 'bg-green-600', OFFLINE: 'bg-gray-500', SYNCING: 'bg-blue-600', SYNCED: 'bg-green-600', FAILED: 'bg-red-600' };

export default function Layout() {
  const { user, logout, language } = useAuth();
  const { status: syncStatus, pendingCount } = useSync();
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const poll = () => alertsApi.notifications(true).then((rows) => { if (!cancelled) setUnreadCount(rows.length); }).catch(() => {});
    poll();
    const interval = setInterval(poll, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const items = NAV_ITEMS.filter((item) => item.roles === 'all' || item.roles.includes(user?.role));

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      <aside className="w-60 shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col overflow-y-auto">
        <div className="p-4 border-b border-gray-800">
          <div className="text-lg font-bold leading-tight">🇮🇳 NER Logistics</div>
          <div className="text-xs text-gray-500">SIH26002 Intelligence Platform</div>
        </div>
        <nav className="flex-1 py-2">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 text-sm ${isActive ? 'bg-blue-900/60 text-white border-r-2 border-blue-500' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`
              }
            >
              <span>{item.icon}</span>
              <span>{t(language, item.key)}</span>
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-800 text-xs text-gray-500">
          <span className="inline-block w-2 h-2 rounded-full bg-yellow-500 mr-1.5" />
          {t(language, 'simulated_data')}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 shrink-0 border-b border-gray-800 bg-gray-900 flex items-center justify-between px-4">
          <div className="flex items-center gap-2 text-xs">
            <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-white ${SYNC_COLORS[syncStatus]}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-white/80" />
              {t(language, syncStatus.toLowerCase())}
              {pendingCount > 0 ? ` (${pendingCount})` : ''}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <button onClick={() => navigate('/alerts')} className="relative text-lg" title="Notifications">
              🔔
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            <div className="text-sm text-right">
              <div className="font-medium">{user?.name}</div>
              <div className="text-xs text-gray-500 capitalize">{user?.role?.replaceAll('_', ' ')}</div>
            </div>
            <button
              onClick={() => { logout(); navigate('/login'); }}
              className="text-xs px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300"
            >
              {t(language, 'logout')}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function LanguageSwitcher() {
  const { language, setLanguage } = useAuth();
  return (
    <select
      value={language}
      onChange={(e) => setLanguage(e.target.value)}
      className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200"
    >
      {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
    </select>
  );
}
