import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import MapView from '../components/MapView.jsx';
import StatCard from '../components/StatCard.jsx';
import Badge from '../components/Badge.jsx';
import { analyticsApi, catalogApi, fleetApi, incidentsApi, alertsApi } from '../services/api.js';

const SEVERITY_TONE = { low: 'low', medium: 'medium', high: 'high', critical: 'critical' };

export default function Dashboard() {
  const [kpis, setKpis] = useState(null);
  const [roads, setRoads] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    const load = () => {
      analyticsApi.kpis().then(setKpis).catch(() => {});
      catalogApi.roads().then(setRoads).catch(() => {});
      fleetApi.vehicles().then(setVehicles).catch(() => {});
      incidentsApi.list({ status: 'open' }).then(setIncidents).catch(() => {});
      alertsApi.list({ limit: 8 }).then(setAlerts).catch(() => {});
    };
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">MODULE 11 · Government / Admin Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        <StatCard label="Monitored Roads" value={kpis?.total_roads ?? '-'} icon="🛣️" tone="blue" />
        <StatCard label="Accessible Roads" value={kpis?.accessible_roads ?? '-'} icon="✅" tone="green" />
        <StatCard label="High-Risk Roads" value={kpis?.high_risk_roads ?? '-'} icon="⚠️" tone="orange" />
        <StatCard label="Blocked Roads" value={kpis?.blocked_roads ?? '-'} icon="⛔" tone="red" />
        <StatCard label="Active Incidents" value={kpis?.active_incidents ?? '-'} icon="🏔️" tone="red" />
        <StatCard label="Vehicles In Transit" value={kpis?.vehicles_in_transit ?? '-'} icon="🚚" tone="blue" />
        <StatCard label="Delayed Vehicles" value={kpis?.delayed_vehicles ?? '-'} icon="⏱️" tone="orange" />
        <StatCard label="Active Shipments" value={kpis?.active_shipments ?? '-'} icon="📦" tone="blue" />
        <StatCard label="Affected Districts" value={kpis?.affected_districts ?? '-'} icon="📍" tone="orange" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-lg p-2 h-[420px]">
          <MapView roads={roads} vehicles={vehicles} incidents={incidents} height="100%" />
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex flex-col h-[420px]">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-medium">🔔 Recent Alerts</h2>
            <Link to="/alerts" className="text-xs text-blue-400 hover:underline">View all</Link>
          </div>
          <div className="space-y-2 overflow-auto">
            {alerts.length === 0 && <div className="text-sm text-gray-500">No alerts yet.</div>}
            {alerts.map((a) => (
              <div key={a.id} className="text-xs p-2 rounded bg-gray-800 border border-gray-700">
                <div className="flex justify-between mb-1">
                  <Badge tone={SEVERITY_TONE[a.severity]}>{a.severity}</Badge>
                  {a.is_prediction ? <span className="text-gray-500">prediction</span> : null}
                </div>
                {a.message_en}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <div className="flex justify-between mb-2">
            <h2 className="font-medium">⚠️ Open Incidents</h2>
            <Link to="/incidents" className="text-xs text-blue-400 hover:underline">View all</Link>
          </div>
          <table className="w-full text-xs">
            <thead className="text-gray-500"><tr><th className="text-left py-1">Type</th><th className="text-left">Severity</th><th className="text-left">Road</th></tr></thead>
            <tbody>
              {incidents.slice(0, 6).map((i) => (
                <tr key={i.id} className="border-t border-gray-800">
                  <td className="py-1 capitalize">{i.type.replaceAll('_', ' ')}</td>
                  <td><Badge tone={SEVERITY_TONE[i.severity]}>{i.severity}</Badge></td>
                  <td>{i.road_name ?? '-'}</td>
                </tr>
              ))}
              {incidents.length === 0 && <tr><td colSpan={3} className="text-gray-500 py-2">No open incidents.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <div className="flex justify-between mb-2">
            <h2 className="font-medium">🚚 Vehicles</h2>
            <Link to="/vehicles" className="text-xs text-blue-400 hover:underline">View all</Link>
          </div>
          <table className="w-full text-xs">
            <thead className="text-gray-500"><tr><th className="text-left py-1">Number</th><th className="text-left">Status</th><th className="text-left">Speed</th></tr></thead>
            <tbody>
              {vehicles.slice(0, 6).map((v) => (
                <tr key={v.id} className="border-t border-gray-800">
                  <td className="py-1">{v.number}</td>
                  <td className="capitalize">{v.status.replaceAll('_', ' ')}</td>
                  <td>{v.speed_kmh ?? 0} km/h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
