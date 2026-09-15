import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { getPendingReports } from '../offline/db.js';
import { syncPendingReports, SYNC_STATUS } from '../offline/sync.js';
import { useAuth } from './AuthContext.jsx';

const SyncContext = createContext(null);

// MODULE 14 - drives the ONLINE/OFFLINE/SYNCING/SYNCED/FAILED indicator shown
// in the top bar, and actually performs the offline -> server sync whenever
// connectivity returns (browser 'online' event) or on a slow background poll
// (covers the case where navigator.onLine is stale).
export function SyncProvider({ children }) {
  const { user } = useAuth();
  const [status, setStatus] = useState(navigator.onLine ? SYNC_STATUS.ONLINE : SYNC_STATUS.OFFLINE);
  const [pendingCount, setPendingCount] = useState(0);
  const syncingRef = useRef(false);

  const refreshPendingCount = useCallback(async () => {
    setPendingCount((await getPendingReports()).length);
  }, []);

  const runSync = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return;
    const token = localStorage.getItem('sih_token');
    if (!token) return;
    const pending = await getPendingReports();
    if (pending.length === 0) { setStatus(SYNC_STATUS.ONLINE); return; }

    syncingRef.current = true;
    setStatus(SYNC_STATUS.SYNCING);
    try {
      await syncPendingReports(token);
      setStatus(SYNC_STATUS.SYNCED);
      setTimeout(() => setStatus(navigator.onLine ? SYNC_STATUS.ONLINE : SYNC_STATUS.OFFLINE), 3000);
    } catch {
      setStatus(SYNC_STATUS.FAILED);
    } finally {
      syncingRef.current = false;
      refreshPendingCount();
    }
  }, [refreshPendingCount]);

  useEffect(() => {
    const onOnline = () => { setStatus(SYNC_STATUS.ONLINE); runSync(); };
    const onOffline = () => setStatus(SYNC_STATUS.OFFLINE);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    refreshPendingCount();
    if (navigator.onLine && user) runSync();
    const interval = setInterval(() => { if (navigator.onLine && user) runSync(); }, 20000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <SyncContext.Provider value={{ status, pendingCount, refreshPendingCount, runSync }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within SyncProvider');
  return ctx;
}
