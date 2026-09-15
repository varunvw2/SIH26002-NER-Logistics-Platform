import React, { useEffect, useState } from 'react';
import Badge from '../components/Badge.jsx';
import { alertsApi } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

const SEVERITY_TONE = { low: 'low', medium: 'medium', high: 'high', critical: 'critical' };

export default function Alerts() {
  const { language } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [tab, setTab] = useState('all');
  const [severity, setSeverity] = useState('');

  const load = () => {
    alertsApi.list(severity ? { severity } : {}).then(setAlerts).catch(() => {});
    alertsApi.notifications().then(setNotifications).catch(() => {});
  };
  useEffect(() => { load(); const i = setInterval(load, 8000); return () => clearInterval(i); }, [severity]);

  const markRead = async (id) => { await alertsApi.markRead(id); load(); };

  const rows = tab === 'mine' ? notifications : alerts;

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">MODULE 8 · Alerts & Notifications</h1>

      <div className="flex gap-2 items-center">
        <button onClick={() => setTab('all')} className={`text-sm px-3 py-1.5 rounded ${tab === 'all' ? 'bg-blue-700' : 'bg-gray-800'}`}>All alerts</button>
        <button onClick={() => setTab('mine')} className={`text-sm px-3 py-1.5 rounded ${tab === 'mine' ? 'bg-blue-700' : 'bg-gray-800'}`}>My notifications</button>
        <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="input ml-auto">
          <option value="">All severities</option>
          {['low', 'medium', 'high', 'critical'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="space-y-2">
        {rows.map((a) => (
          <div key={a.notification_id ?? a.id} className="bg-gray-900 border border-gray-800 rounded-lg p-3 text-sm flex justify-between items-start gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge tone={SEVERITY_TONE[a.severity]}>{a.severity}</Badge>
                <span className="text-xs text-gray-500 capitalize">{a.type.replaceAll('_', ' ')}</span>
                {a.is_prediction ? <Badge tone="yellow">prediction</Badge> : null}
              </div>
              <div>{language === 'hi' && a.message_hi ? a.message_hi : a.message_en}</div>
              <div className="text-xs text-gray-500 mt-1">{new Date(a.created_at).toLocaleString()}</div>
            </div>
            {tab === 'mine' && !a.read_at && (
              <button onClick={() => markRead(a.notification_id)} className="text-xs text-blue-400 hover:underline shrink-0">Mark read</button>
            )}
          </div>
        ))}
        {rows.length === 0 && <div className="text-gray-500 text-sm">No alerts.</div>}
      </div>
    </div>
  );
}
