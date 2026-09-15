import React, { useEffect, useState } from 'react';
import MapView from '../components/MapView.jsx';
import Badge from '../components/Badge.jsx';
import { emergencyApi } from '../services/api.js';

export default function EmergencyMode() {
  const [data, setData] = useState(null);

  useEffect(() => {
    const load = () => emergencyApi.state().then(setData).catch(() => {});
    load();
    const i = setInterval(load, 6000);
    return () => clearInterval(i);
  }, []);

  if (!data) return <div className="text-gray-400">Loading emergency state...</div>;

  const roads = [
    ...data.blocked_roads.map((r) => ({ id: r.road_id, name: r.name, risk_level: 'red', status: 'red', coordinates: r.coordinates })),
    ...data.safest_available_routes.map((r) => ({ id: r.road_id, name: r.name, risk_level: r.risk_level, status: r.risk_level, coordinates: r.coordinates }))
  ];
  const locations = [...data.hospitals, ...data.relief_centers, ...data.warehouses];

  return (
    <div className="space-y-4">
      <div className="bg-red-950 border-2 border-red-700 rounded-lg p-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-red-200">🚨 EMERGENCY MODE ACTIVE</h1>
          <p className="text-sm text-red-300">Blocked roads, safe corridors, critical facilities and emergency assets - live view.</p>
        </div>
        <div className="text-xs text-red-300">Updated {new Date(data.generated_at).toLocaleTimeString()}</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-gray-900 border border-red-900 rounded-lg p-2 h-[480px]">
          <MapView roads={roads} locations={locations} vehicles={data.emergency_vehicles} height="100%" />
        </div>

        <div className="space-y-3 max-h-[480px] overflow-auto">
          <Section title="⛔ Blocked Roads" tone="red">
            {data.blocked_roads.map((r) => (
              <div key={r.road_id} className="text-sm">
                <div className="font-medium">{r.name}</div>
                <div className="text-xs text-gray-400">{r.factors?.slice(0, 2).join('; ')}</div>
              </div>
            ))}
            {data.blocked_roads.length === 0 && <div className="text-sm text-gray-500">No roads currently blocked.</div>}
          </Section>

          <Section title="✅ Safest Available Routes" tone="green">
            {data.safest_available_routes.slice(0, 5).map((r) => (
              <div key={r.road_id} className="text-sm flex justify-between">
                <span>{r.name}</span>
                <Badge tone={r.risk_level}>{r.risk_score}/100</Badge>
              </div>
            ))}
          </Section>

          <Section title="📍 Affected Districts" tone="orange">
            {data.affected_districts.map((d) => (
              <div key={d.district_id} className="text-sm flex justify-between">
                <span>{d.district_name}</span>
                <Badge tone={d.risk === 'critical' ? 'red' : 'orange'}>{d.connectivity_score}/100</Badge>
              </div>
            ))}
            {data.affected_districts.length === 0 && <div className="text-sm text-gray-500">No severely affected districts.</div>}
          </Section>

          <Section title="📦 Critical Priority Shipments" tone="blue">
            {data.critical_priority_shipments.map((s) => (
              <div key={s.id} className="text-sm">{s.shipment_code} - {s.cargo_type.replaceAll('_', ' ')}</div>
            ))}
            {data.critical_priority_shipments.length === 0 && <div className="text-sm text-gray-500">None in progress.</div>}
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, tone, children }) {
  const border = { red: 'border-red-900', green: 'border-green-900', orange: 'border-orange-900', blue: 'border-blue-900' }[tone];
  return (
    <div className={`bg-gray-900 border ${border} rounded-lg p-3`}>
      <div className="font-medium mb-2 text-sm">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
