import React, { useEffect, useState } from 'react';
import MapView from '../components/MapView.jsx';
import Badge from '../components/Badge.jsx';
import { fleetApi } from '../services/api.js';

const STATUS_TONE = {
  not_started: 'gray', in_transit: 'green', delayed: 'orange',
  rerouted: 'yellow', delivered: 'gray', emergency: 'red'
};

export default function VehicleTracking() {
  const [vehicles, setVehicles] = useState([]);
  const [selected, setSelected] = useState(null);

  const load = () => fleetApi.vehicles().then(setVehicles).catch(() => {});

  useEffect(() => {
    load();
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, []);

  const tick = async (id) => {
    try { await fleetApi.simulateTick(id); load(); } catch { /* no assigned route yet */ }
  };

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">MODULE 5 · Vehicle GPS Tracking</h1>
      <p className="text-sm text-gray-400">
        Positions update automatically every ~5s (server-side simulation loop). Real GPS integration point:
        a driver's phone can PATCH the same <code>/vehicles/:id/gps</code> endpoint - no backend change needed.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-lg p-2 h-[480px]">
          <MapView vehicles={vehicles} height="100%" />
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-auto h-[480px]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-900 text-gray-500">
              <tr><th className="text-left p-2">Vehicle</th><th className="text-left">Status</th><th className="text-left">Speed</th><th /></tr>
            </thead>
            <tbody>
              {vehicles.map((v) => (
                <tr key={v.id} className={`border-t border-gray-800 cursor-pointer ${selected === v.id ? 'bg-gray-800' : ''}`} onClick={() => setSelected(v.id)}>
                  <td className="p-2">
                    <div className="font-medium">{v.number}</div>
                    <div className="text-gray-500">{v.driver_name ?? 'Unassigned driver'}</div>
                  </td>
                  <td><Badge tone={STATUS_TONE[v.status]}>{v.status.replaceAll('_', ' ')}</Badge></td>
                  <td>{v.speed_kmh ?? 0} km/h</td>
                  <td className="p-2">
                    {(v.status === 'in_transit' || v.status === 'rerouted') && v.current_route_id && (
                      <button onClick={(e) => { e.stopPropagation(); tick(v.id); }} className="text-xs bg-blue-800 hover:bg-blue-700 rounded px-2 py-1">
                        Tick
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {vehicles.length === 0 && <tr><td colSpan={4} className="p-3 text-gray-500">No vehicles.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
