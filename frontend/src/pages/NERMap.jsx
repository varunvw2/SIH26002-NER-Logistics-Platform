import React, { useEffect, useMemo, useState } from 'react';
import MapView from '../components/MapView.jsx';
import Badge from '../components/Badge.jsx';
import { catalogApi, fleetApi, incidentsApi, shipmentsApi } from '../services/api.js';

const RISK_TONE = { green: 'green', yellow: 'yellow', orange: 'orange', red: 'red' };

export default function NERMap() {
  const [states, setStates] = useState([]);
  const [roads, setRoads] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [locations, setLocations] = useState([]);
  const [shipments, setShipments] = useState([]);

  const [filters, setFilters] = useState({ state_id: '', risk_level: '', incident_type: '', cargo_priority: '' });
  const [selectedRoad, setSelectedRoad] = useState(null);

  useEffect(() => {
    catalogApi.states().then(setStates).catch(() => {});
    catalogApi.locations().then(setLocations).catch(() => {});
    shipmentsApi.list().then(setShipments).catch(() => {});

    // Vehicles and incidents genuinely move/change server-side, so poll them.
    const load = () => {
      fleetApi.vehicles().then(setVehicles).catch(() => {});
      incidentsApi.list().then(setIncidents).catch(() => {});
    };
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Road risk is recomputed live from weather (which drifts every ~30s
    // server-side) and open incidents, so poll rather than fetch once.
    const load = () => catalogApi.roads(filters.state_id ? { state_id: filters.state_id } : {}).then(setRoads).catch(() => {});
    load();
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
  }, [filters.state_id]);

  const filteredRoads = useMemo(
    () => roads.filter((r) => !filters.risk_level || r.risk_level === filters.risk_level),
    [roads, filters.risk_level]
  );

  const filteredIncidents = useMemo(
    () => incidents.filter((i) => !filters.incident_type || i.type === filters.incident_type),
    [incidents, filters.incident_type]
  );

  // Cargo-priority filter: show only vehicles currently carrying a shipment
  // of the selected priority.
  const filteredVehicles = useMemo(() => {
    if (!filters.cargo_priority) return vehicles;
    const vehicleIds = new Set(shipments.filter((s) => s.priority === filters.cargo_priority).map((s) => s.vehicle_id));
    return vehicles.filter((v) => vehicleIds.has(v.id));
  }, [vehicles, shipments, filters.cargo_priority]);

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">MODULE 1 · NER Map</h1>

      <div className="flex flex-wrap gap-2 bg-gray-900 border border-gray-800 rounded-lg p-3">
        <Select label="State" value={filters.state_id} onChange={(v) => setFilters((f) => ({ ...f, state_id: v }))}
          options={[['', 'All states'], ...states.map((s) => [s.id, s.name])]} />
        <Select label="Risk level" value={filters.risk_level} onChange={(v) => setFilters((f) => ({ ...f, risk_level: v }))}
          options={[['', 'All levels'], ['green', 'Green'], ['yellow', 'Yellow'], ['orange', 'Orange'], ['red', 'Red']]} />
        <Select label="Incident type" value={filters.incident_type} onChange={(v) => setFilters((f) => ({ ...f, incident_type: v }))}
          options={[['', 'All types'], ['landslide', 'Landslide'], ['flood', 'Flood'], ['road_blocked', 'Road blocked'], ['bridge_damaged', 'Bridge damaged'], ['accident', 'Accident'], ['heavy_traffic', 'Heavy traffic'], ['road_damage', 'Road damage'], ['weather_hazard', 'Weather hazard'], ['other', 'Other']]} />
        <Select label="Cargo priority" value={filters.cargo_priority} onChange={(v) => setFilters((f) => ({ ...f, cargo_priority: v }))}
          options={[['', 'All priorities'], ['critical', 'Critical'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']]} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        <div className="lg:col-span-3 bg-gray-900 border border-gray-800 rounded-lg p-2 h-[560px]">
          <MapView
            roads={filteredRoads} vehicles={filteredVehicles} incidents={filteredIncidents} locations={locations}
            onRoadClick={setSelectedRoad} height="100%"
          />
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 h-[560px] overflow-auto">
          <h2 className="font-medium mb-2">Road detail</h2>
          {!selectedRoad && <div className="text-sm text-gray-500">Click a road on the map to see its live risk detail.</div>}
          {selectedRoad && (
            <div className="space-y-2 text-sm">
              <div className="font-medium">{selectedRoad.name}</div>
              <div className="flex gap-2">
                <Badge tone={RISK_TONE[selectedRoad.risk_level]}>{selectedRoad.risk_level} risk</Badge>
                <Badge tone={RISK_TONE[selectedRoad.status]}>{selectedRoad.status} status</Badge>
              </div>
              <div>Risk score: <span className="font-semibold">{selectedRoad.risk_score}/100</span></div>
            </div>
          )}

          <h2 className="font-medium mt-4 mb-2">Legend</h2>
          <div className="space-y-1 text-xs text-gray-400">
            <div>🚚 Vehicle &nbsp; ⚠️/🟧/🟥 Incident (by severity)</div>
            <div>🏭 Warehouse &nbsp; 🏥 Hospital &nbsp; ⛺ Relief center &nbsp; 🚉 Transport hub</div>
            <div className="pt-2">Road color = live risk: <Badge tone="green">green</Badge> <Badge tone="yellow">yellow</Badge> <Badge tone="orange">orange</Badge> <Badge tone="red">red</Badge></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="text-xs text-gray-400 flex flex-col gap-1">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
