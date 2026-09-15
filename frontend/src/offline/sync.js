import { getPendingReports, removeReport } from './db.js';
import { API_URL } from '../services/api.js';

// MODULE 14 - Sync status states shown in the UI.
export const SYNC_STATUS = { ONLINE: 'ONLINE', OFFLINE: 'OFFLINE', SYNCING: 'SYNCING', SYNCED: 'SYNCED', FAILED: 'FAILED' };

/**
 * Pushes every queued offline field report to the server in one batch
 * (idempotent - see backend POST /api/field-reports/sync, keyed by
 * client_uuid) and removes whichever ones the server confirms it applied.
 */
export async function syncPendingReports(token) {
  const pending = await getPendingReports();
  if (pending.length === 0) return { synced: 0, remaining: 0 };

  const res = await fetch(`${API_URL}/field-reports/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ reports: pending })
  });
  if (!res.ok) throw new Error(`Sync failed: HTTP ${res.status}`);

  const { results } = await res.json();
  let synced = 0;
  for (const r of results) {
    if (r.status === 'created' || r.status === 'duplicate') {
      await removeReport(r.client_uuid);
      synced++;
    }
  }
  const remaining = (await getPendingReports()).length;
  return { synced, remaining };
}
