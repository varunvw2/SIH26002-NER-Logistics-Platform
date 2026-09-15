import React, { useEffect, useState } from 'react';
import Badge from '../components/Badge.jsx';
import { shipmentsApi, catalogApi, fleetApi } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

const PRIORITY_TONE = { critical: 'critical', high: 'high', medium: 'medium', low: 'low' };
const STATUS_TONE = { pending: 'gray', in_transit: 'green', delayed: 'orange', rerouted: 'yellow', delivered: 'gray', cancelled: 'red' };
const CARGO_TYPES = ['medicine', 'food', 'agricultural_produce', 'construction_material', 'emergency_supplies', 'other'];

export default function Shipments() {
  const { user } = useAuth();
  const [shipments, setShipments] = useState([]);
  const [locations, setLocations] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ cargo_type: 'medicine', priority: 'critical', origin_location_id: '', destination_location_id: '', vehicle_id: '', cargo_quantity: '' });
  const [error, setError] = useState('');

  const load = () => shipmentsApi.list().then(setShipments).catch(() => {});

  useEffect(() => {
    load();
    catalogApi.locations().then(setLocations).catch(() => {});
    fleetApi.vehicles().then(setVehicles).catch(() => {});
  }, []);

  const canManage = ['admin', 'logistics_manager'].includes(user?.role);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await shipmentsApi.create({
        ...form,
        origin_location_id: Number(form.origin_location_id),
        destination_location_id: Number(form.destination_location_id),
        vehicle_id: form.vehicle_id ? Number(form.vehicle_id) : undefined
      });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-semibold">MODULE 9 · Logistics / Delivery Management</h1>
        {canManage && (
          <button onClick={() => setShowForm((s) => !s)} className="bg-blue-600 hover:bg-blue-700 rounded px-3 py-1.5 text-sm">
            {showForm ? 'Cancel' : '+ New Shipment'}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={submit} className="bg-gray-900 border border-gray-800 rounded-lg p-4 grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <Field label="Cargo type">
            <select value={form.cargo_type} onChange={(e) => setForm((f) => ({ ...f, cargo_type: e.target.value }))} className="input">
              {CARGO_TYPES.map((c) => <option key={c} value={c}>{c.replaceAll('_', ' ')}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} className="input">
              {['critical', 'high', 'medium', 'low'].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Quantity / description">
            <input value={form.cargo_quantity} onChange={(e) => setForm((f) => ({ ...f, cargo_quantity: e.target.value }))} className="input" placeholder="e.g. 500 kg" />
          </Field>
          <Field label="Origin">
            <select value={form.origin_location_id} onChange={(e) => setForm((f) => ({ ...f, origin_location_id: e.target.value }))} className="input" required>
              <option value="">Select...</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
          <Field label="Destination">
            <select value={form.destination_location_id} onChange={(e) => setForm((f) => ({ ...f, destination_location_id: e.target.value }))} className="input" required>
              <option value="">Select...</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
          <Field label="Vehicle (optional)">
            <select value={form.vehicle_id} onChange={(e) => setForm((f) => ({ ...f, vehicle_id: e.target.value }))} className="input">
              <option value="">Unassigned</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.number}</option>)}
            </select>
          </Field>
          <div className="col-span-full flex items-center gap-3">
            <button type="submit" className="bg-green-700 hover:bg-green-600 rounded px-4 py-1.5 text-sm">Create shipment</button>
            {error && <span className="text-red-400 text-xs">{error}</span>}
          </div>
        </form>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-auto">
        <table className="w-full text-sm">
          <thead className="text-gray-500 text-xs">
            <tr>
              <th className="text-left p-3">Shipment</th><th className="text-left">Cargo</th><th className="text-left">Priority</th>
              <th className="text-left">Route</th><th className="text-left">Vehicle</th><th className="text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {shipments.map((s) => (
              <tr key={s.id} className="border-t border-gray-800">
                <td className="p-3 font-mono text-xs">{s.shipment_code}</td>
                <td className="capitalize">{s.cargo_type.replaceAll('_', ' ')}</td>
                <td><Badge tone={PRIORITY_TONE[s.priority]}>{s.priority}</Badge></td>
                <td className="text-xs text-gray-400">{s.origin_name} → {s.destination_name}</td>
                <td className="text-xs">{s.vehicle_number ?? '-'}</td>
                <td><Badge tone={STATUS_TONE[s.status]}>{s.status.replaceAll('_', ' ')}</Badge></td>
              </tr>
            ))}
            {shipments.length === 0 && <tr><td colSpan={6} className="p-4 text-gray-500">No shipments yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return <label className="text-xs text-gray-400 flex flex-col gap-1">{label}{children}</label>;
}
