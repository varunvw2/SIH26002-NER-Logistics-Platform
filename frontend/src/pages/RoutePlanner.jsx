import React, { useEffect, useState } from 'react';
import MapView from '../components/MapView.jsx';
import Badge from '../components/Badge.jsx';
import { catalogApi, planningApi, fleetApi } from '../services/api.js';

const RISK_TONE = { green: 'green', yellow: 'yellow', orange: 'orange', red: 'red' };
const PRIORITIES = ['critical', 'high', 'medium', 'low'];

export default function RoutePlanner() {
  const [districts, setDistricts] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [priority, setPriority] = useState('critical');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [assignVehicleId, setAssignVehicleId] = useState('');
  const [assignMessage, setAssignMessage] = useState('');

  useEffect(() => {
    catalogApi.districts().then((rows) => {
      setDistricts(rows);
      // Default to the demo's flagship corridor: Guwahati -> Itanagar.
      const guwahati = rows.find((d) => d.name === 'Kamrup Metropolitan');
      const itanagar = rows.find((d) => d.name === 'Papum Pare');
      if (guwahati) setOrigin(String(guwahati.id));
      if (itanagar) setDestination(String(itanagar.id));
    }).catch(() => {});
    fleetApi.vehicles({ status: 'not_started' }).then(setVehicles).catch(() => {});
  }, []);

  const calculate = async () => {
    setLoading(true);
    setError('');
    setResult(null);
    setAssignMessage('');
    try {
      const res = await planningApi.optimizeRoute({
        origin_district_id: Number(origin), dest_district_id: Number(destination), priority
      });
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const assign = async (route) => {
    if (!assignVehicleId) { setAssignMessage('Select a vehicle first.'); return; }
    try {
      await fleetApi.assignRoute(assignVehicleId, route.id);
      setAssignMessage(`Vehicle assigned to "${route.status}" route. It will start moving automatically.`);
    } catch (err) {
      setAssignMessage(`Error: ${err.message}`);
    }
  };

  const routeCandidates = result?.routes || [];

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">MODULE 3 · AI Route Optimization</h1>
      <p className="text-sm text-gray-400">
        Not shortest-distance routing - candidate routes are scored on distance, time <em>and</em> live risk
        (module 2), weighted by cargo priority. See <a href="#explain" className="text-blue-400 hover:underline">how this works</a>.
      </p>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex flex-wrap items-end gap-3">
        <Field label="Origin district">
          <select value={origin} onChange={(e) => setOrigin(e.target.value)} className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5">
            {districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Destination district">
          <select value={destination} onChange={(e) => setDestination(e.target.value)} className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5">
            {districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Cargo priority">
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 capitalize">
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <button onClick={calculate} disabled={loading || !origin || !destination}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 rounded px-4 py-2 text-sm font-medium">
          {loading ? 'Calculating...' : 'Calculate Routes'}
        </button>
        {error && <div className="text-sm text-red-400">{error}</div>}
      </div>

      {result && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-lg p-2 h-[420px]">
            <MapView routeCandidates={routeCandidates} height="100%"
              center={[(districts.find(d=>String(d.id)===origin)?.lng ?? 92) , (districts.find(d=>String(d.id)===origin)?.lat ?? 26)]} zoom={6} />
          </div>
          <div className="space-y-3 max-h-[420px] overflow-auto">
            {routeCandidates.map((route) => (
              <div key={route.id} className="bg-gray-900 border border-gray-800 rounded-lg p-3 text-sm">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-semibold uppercase text-xs">{route.status}</span>
                  <Badge tone={RISK_TONE[route.risk_level]}>{route.risk_level} · {route.risk_score}/100</Badge>
                </div>
                <div className="text-gray-400 text-xs mb-2">
                  {route.distance_km} km · {(route.duration_minutes / 60).toFixed(1)} h
                  {route.delay_minutes > 0 && <span className="text-orange-400"> (+{Math.round(route.delay_minutes)} min risk delay)</span>}
                </div>
                <div className="text-xs mb-2">via {route.road_names.join(' → ')}</div>
                <div className="text-xs text-gray-300">{route.explanation}</div>
                {route.status === 'recommended' && (
                  <div className="mt-2 flex gap-2 items-center">
                    <select value={assignVehicleId} onChange={(e) => setAssignVehicleId(e.target.value)}
                      className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs flex-1">
                      <option value="">Assign to vehicle...</option>
                      {vehicles.map((v) => <option key={v.id} value={v.id}>{v.number}</option>)}
                    </select>
                    <button onClick={() => assign(route)} className="text-xs bg-green-700 hover:bg-green-600 rounded px-2 py-1">Assign</button>
                  </div>
                )}
              </div>
            ))}
            {assignMessage && <div className="text-xs text-blue-300 bg-blue-950 border border-blue-900 rounded p-2">{assignMessage}</div>}
          </div>
        </div>
      )}

      <div id="explain" className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-sm text-gray-400">
        <div className="font-medium text-gray-300 mb-1">How the recommendation works</div>
        Each candidate road's risk score comes from the live risk engine (rainfall, terrain slope, road/bridge
        condition, incident history - see Weather/Risk page). Routes are ranked by a weighted cost of distance,
        travel time and risk; a <strong>critical</strong>-priority shipment (e.g. medicine) weights risk far more
        heavily than a <strong>low</strong>-priority one, which is why the recommended route can be longer than
        the shortest available path.
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return <label className="text-xs text-gray-400 flex flex-col gap-1">{label}{children}</label>;
}
