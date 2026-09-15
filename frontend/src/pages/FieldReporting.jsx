import React, { useEffect, useState } from 'react';
import { incidentsApi, catalogApi } from '../services/api.js';
import { queueReport, newClientUuid } from '../offline/db.js';
import { useSync } from '../context/SyncContext.jsx';

// MODULE 6 (free-text half of module 7) + MODULE 14 (offline-first).
//
//   LOCAL DATA (IndexedDB) -> SYNC QUEUE -> SERVER -> CENTRAL DASHBOARD
//
// This form works with no network at all: GPS is captured client-side,
// the report is written to IndexedDB immediately, and a submission attempt
// is made online-first with an automatic offline fallback.
export default function FieldReporting() {
  const { refreshPendingCount, runSync } = useSync();
  const [rawText, setRawText] = useState('');
  const [coords, setCoords] = useState(null);
  const [gpsError, setGpsError] = useState('');
  const [roads, setRoads] = useState([]);
  const [roadId, setRoadId] = useState('');
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    catalogApi.roads().then(setRoads).catch(() => {});
    if (!navigator.geolocation) { setGpsError('Geolocation not supported by this browser.'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGpsError('Location permission denied - using default demo coordinates.'),
      { timeout: 5000 }
    );
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    const report = {
      client_uuid: newClientUuid(),
      raw_text: rawText,
      latitude: coords?.lat ?? 26.1445,
      longitude: coords?.lng ?? 91.7362,
      road_id: roadId ? Number(roadId) : undefined,
      created_offline_at: new Date().toISOString()
    };

    if (navigator.onLine) {
      try {
        const res = await incidentsApi.submitFieldReport(report);
        setResult({ mode: 'synced', ...res });
        setRawText('');
        setSubmitting(false);
        return;
      } catch (err) {
        // fall through to offline queue on network/server failure
        console.warn('Online submit failed, queuing offline:', err.message);
      }
    }

    await queueReport(report);
    await refreshPendingCount();
    setResult({ mode: 'queued' });
    setRawText('');
    setSubmitting(false);
  };

  return (
    <div className="max-w-2xl space-y-3">
      <h1 className="text-xl font-semibold">MODULE 6/7/14 · Field Reporting (works offline)</h1>
      <p className="text-sm text-gray-400">
        Describe what you see in plain language. The system extracts incident type, cause and severity
        automatically (heuristic NLP - flagged "AI Suggested", pending human verification).
      </p>

      <form onSubmit={submit} className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3 text-sm">
        <div className="text-xs text-gray-400">
          📍 GPS: {coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)} (auto-attached)` : 'Detecting...'}
          {gpsError && <span className="text-yellow-500"> - {gpsError}</span>}
        </div>

        <label className="text-xs text-gray-400 flex flex-col gap-1">
          Affected road (optional)
          <select value={roadId} onChange={(e) => setRoadId(e.target.value)} className="input">
            <option value="">Not sure / not applicable</option>
            {roads.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>

        <label className="text-xs text-gray-400 flex flex-col gap-1">
          What happened?
          <textarea
            value={rawText} onChange={(e) => setRawText(e.target.value)} required rows={4} className="input"
            placeholder="e.g. Bridge near village X is partially damaged because of flooding."
          />
        </label>

        <button type="submit" disabled={submitting || !rawText} className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 rounded px-4 py-2 font-medium">
          {submitting ? 'Submitting...' : navigator.onLine ? 'Submit report' : 'Save offline (will sync automatically)'}
        </button>
      </form>

      {result?.mode === 'queued' && (
        <div className="bg-yellow-950 border border-yellow-800 rounded-lg p-3 text-sm text-yellow-200">
          Saved locally - no connection right now. It will sync automatically once you're back online
          (or tap below to retry now).
          <button onClick={runSync} className="ml-2 underline">Retry sync</button>
        </div>
      )}
      {result?.mode === 'synced' && (
        <div className="bg-green-950 border border-green-800 rounded-lg p-3 text-sm text-green-200 space-y-1">
          <div className="font-medium">Submitted. AI-extracted structure:</div>
          <div>Incident Type: <strong className="capitalize">{result.extracted.type.replaceAll('_', ' ')}</strong></div>
          <div>Cause: <strong className="capitalize">{result.extracted.cause}</strong></div>
          <div>Severity: <strong className="capitalize">{result.extracted.severity}</strong></div>
          <div>Status: <strong>Pending Verification</strong> (AI Suggested, confidence {Math.round(result.extracted.confidence * 100)}%)</div>
        </div>
      )}
    </div>
  );
}
