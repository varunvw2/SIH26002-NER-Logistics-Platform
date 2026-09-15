import React, { useEffect, useState } from 'react';
import Badge from '../components/Badge.jsx';
import { incidentsApi, catalogApi } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

const SEVERITY_TONE = { low: 'low', medium: 'medium', high: 'high', critical: 'critical' };
const TYPES = ['landslide', 'flood', 'road_blocked', 'bridge_damaged', 'accident', 'heavy_traffic', 'road_damage', 'weather_hazard', 'other'];

export default function Incidents() {
  const { user } = useAuth();
  const [incidents, setIncidents] = useState([]);
  const [roads, setRoads] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: 'landslide', severity: 'high', road_id: '', latitude: '26.1', longitude: '91.7', description: '' });
  const [photo, setPhoto] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = () => incidentsApi.list().then(setIncidents).catch(() => {});
  useEffect(() => { load(); catalogApi.roads().then(setRoads).catch(() => {}); }, []);

  const canReport = ['field_officer', 'authority_officer', 'admin'].includes(user?.role);
  const canVerify = ['authority_officer', 'admin'].includes(user?.role);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (v !== '') fd.append(k, v); });
      if (photo) fd.append('photo', photo);
      await incidentsApi.create(fd);
      setShowForm(false);
      setPhoto(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const verify = async (id, verification_status) => {
    await incidentsApi.verify(id, { verification_status, status: verification_status === 'officially_verified' ? 'open' : 'resolved' });
    load();
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-semibold">MODULE 6+7 · Incident Reporting & AI Classification</h1>
        {canReport && (
          <button onClick={() => setShowForm((s) => !s)} className="bg-blue-600 hover:bg-blue-700 rounded px-3 py-1.5 text-sm">
            {showForm ? 'Cancel' : '+ Report Incident'}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={submit} className="bg-gray-900 border border-gray-800 rounded-lg p-4 grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <Field label="Type">
            <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="input">
              {TYPES.map((t) => <option key={t} value={t}>{t.replaceAll('_', ' ')}</option>)}
            </select>
          </Field>
          <Field label="Severity">
            <select value={form.severity} onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))} className="input">
              {['low', 'medium', 'high', 'critical'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Affected road (optional)">
            <select value={form.road_id} onChange={(e) => setForm((f) => ({ ...f, road_id: e.target.value }))} className="input">
              <option value="">None</option>
              {roads.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
          <Field label="Latitude (GPS auto-attached)">
            <input value={form.latitude} onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))} className="input" required />
          </Field>
          <Field label="Longitude (GPS auto-attached)">
            <input value={form.longitude} onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))} className="input" required />
          </Field>
          <Field label="Photo (optional - triggers AI classification)">
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setPhoto(e.target.files[0])} className="text-xs" />
          </Field>
          <Field label="Description" className="col-span-full">
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="input col-span-full" rows={2} />
          </Field>
          <div className="col-span-full flex items-center gap-3">
            <button type="submit" disabled={submitting} className="bg-green-700 hover:bg-green-600 disabled:bg-gray-700 rounded px-4 py-1.5 text-sm">
              {submitting ? 'Submitting...' : 'Submit report'}
            </button>
            {error && <span className="text-red-400 text-xs">{error}</span>}
          </div>
          <p className="col-span-full text-xs text-gray-500">
            A critical/high severity report on a named road immediately flips that road's status and notifies
            authorities/logistics managers. If you attach a photo, the AI image classification result is
            clearly labeled "AI Suggested" - not "Officially Verified" - until a human confirms it below.
          </p>
        </form>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-auto">
        <table className="w-full text-sm">
          <thead className="text-gray-500 text-xs">
            <tr><th className="text-left p-3">Type</th><th className="text-left">Severity</th><th className="text-left">Road</th><th className="text-left">Verification</th><th className="text-left">Reported</th>{canVerify && <th />}</tr>
          </thead>
          <tbody>
            {incidents.map((i) => (
              <tr key={i.id} className="border-t border-gray-800">
                <td className="p-3 capitalize">{i.type.replaceAll('_', ' ')}</td>
                <td><Badge tone={SEVERITY_TONE[i.severity]}>{i.severity}</Badge></td>
                <td className="text-xs">{i.road_name ?? '-'}</td>
                <td>
                  <Badge tone={i.verification_status === 'officially_verified' ? 'green' : i.verification_status === 'rejected' ? 'red' : 'yellow'}>
                    {i.verification_status.replaceAll('_', ' ')}
                  </Badge>
                </td>
                <td className="text-xs text-gray-500">{new Date(i.created_at).toLocaleString()}</td>
                {canVerify && (
                  <td className="text-xs space-x-2 p-2">
                    {i.verification_status !== 'officially_verified' && (
                      <button onClick={() => verify(i.id, 'officially_verified')} className="text-green-400 hover:underline">Verify</button>
                    )}
                    {i.verification_status !== 'rejected' && (
                      <button onClick={() => verify(i.id, 'rejected')} className="text-red-400 hover:underline">Reject</button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {incidents.length === 0 && <tr><td colSpan={6} className="p-4 text-gray-500">No incidents reported.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, children, className = '' }) {
  return <label className={`text-xs text-gray-400 flex flex-col gap-1 ${className}`}>{label}{children}</label>;
}
