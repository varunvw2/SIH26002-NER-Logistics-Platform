import React, { useEffect, useState, useCallback, useMemo } from 'react';
import MapView from '../components/MapView.jsx';
import Badge from '../components/Badge.jsx';
import { driverApi, catalogApi, planningApi, fleetApi, alertsApi } from '../services/api.js';

const RISK_TONE = { green: 'green', yellow: 'yellow', orange: 'orange', red: 'red' };
const PIPELINE = ['Assigned Shipment', 'Recommended Route', 'Start Journey', 'GPS Tracking', 'Risk Monitoring', 'Alert', 'Alternate Route', 'Reroute', 'Delivery'];

// The exact pipeline requested:
//   Login -> Assigned Shipment -> View Recommended Route -> Start Journey ->
//   GPS Tracking -> Risk Monitoring -> Alert -> Alternate Route -> Reroute -> Delivery
//
// Modeled as 4 real phases (GPS/Risk/Alerts/Reroute all happen concurrently
// once a journey is under way, not as one-time sequential steps):
//   'pick'      - choose shipment + confirm origin/destination
//   'plan'      - view recommended + alternative routes, pick one
//   'transit'   - live GPS tracking, risk monitoring, alerts, reroute offer
//   'delivered' - arrival confirmation
export default function DriverJourney() {
  const [vehicle, setVehicle] = useState(null);
  const [shipments, setShipments] = useState([]);
  // Only the id is kept in state - the shipment object itself is always
  // looked up fresh from the polled `shipments` list below, so its status
  // (pending/in_transit/delivered/...) never goes stale while this page is
  // open, unlike holding a frozen snapshot object would.
  const [selectedShipmentId, setSelectedShipmentId] = useState(null);
  const [locations, setLocations] = useState([]);
  const [originId, setOriginId] = useState('');
  const [destId, setDestId] = useState('');
  const [routeResult, setRouteResult] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  const [currentRoute, setCurrentRoute] = useState(null);
  const [navSteps, setNavSteps] = useState([]);
  const [roadRisks, setRoadRisks] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [rerouteOptions, setRerouteOptions] = useState(null);
  const [findingAlternate, setFindingAlternate] = useState(false);

  const loadVehicleAndShipments = useCallback(() => {
    driverApi.myVehicle().then(setVehicle).catch(() => setVehicle(null));
    driverApi.myShipments().then(setShipments).catch(() => setShipments([]));
  }, []);

  useEffect(() => {
    loadVehicleAndShipments();
    catalogApi.locations().then(setLocations).catch(() => {});
    const interval = setInterval(loadVehicleAndShipments, 4000);
    return () => clearInterval(interval);
  }, [loadVehicleAndShipments]);

  // Always resolves against the LIVE shipments list (falls back to the first
  // assigned shipment if nothing/no-longer-existing is selected) - never a
  // stale object.
  const selectedShipment = useMemo(
    () => shipments.find((s) => s.id === selectedShipmentId) ?? shipments[0] ?? null,
    [shipments, selectedShipmentId]
  );

  // Prefill origin/destination only when switching to a *different*
  // shipment (keyed on id) - not on every poll of the same one, so the
  // driver's edits aren't clobbered every 4s.
  useEffect(() => {
    if (selectedShipment) {
      setOriginId(String(selectedShipment.origin_location_id));
      setDestId(String(selectedShipment.destination_location_id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedShipment?.id]);

  const phase = useMemo(() => {
    if (!vehicle) return 'pick';
    // Keyed off the SHIPMENT's own status, not the vehicle's - a vehicle
    // that finished a previous shipment stays 'delivered' until it's
    // assigned a new one, but that must never be mistaken for the newly
    // assigned shipment (status 'pending') already being delivered.
    if (selectedShipment?.status === 'delivered') return 'delivered';
    if (vehicle.status === 'in_transit' || vehicle.status === 'rerouted') return 'transit';
    if (routeResult) return 'plan';
    return 'pick';
  }, [vehicle, routeResult, selectedShipment]);

  // MODULE 5+2 - live GPS tracking + risk monitoring while in transit.
  useEffect(() => {
    if (phase !== 'transit' || !vehicle?.current_route_id) { setCurrentRoute(null); setRoadRisks([]); return; }
    let cancelled = false;
    const load = async () => {
      const route = await planningApi.route(vehicle.current_route_id).catch(() => null);
      if (cancelled || !route) return;
      setCurrentRoute(route);
      const risks = await Promise.all(route.road_ids.map((id) => catalogApi.road(id).catch(() => null)));
      if (!cancelled) setRoadRisks(risks.filter(Boolean));
    };
    load();
    const interval = setInterval(load, 4000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [phase, vehicle?.current_route_id]);

  // Turn-by-turn steps for the active route. Fetched once per route (the
  // backend caches them too) - they don't change as the vehicle moves, only
  // which step is *current* does, which is derived from progress below.
  useEffect(() => {
    if (!currentRoute?.id) { setNavSteps([]); return; }
    let cancelled = false;
    planningApi.navigation(currentRoute.id)
      .then((res) => { if (!cancelled) setNavSteps(res.steps || []); })
      .catch(() => { if (!cancelled) setNavSteps([]); });
    return () => { cancelled = true; };
  }, [currentRoute?.id]);

  // MODULE 8 - alerts targeted at this driver/vehicle.
  useEffect(() => {
    const load = () => alertsApi.notifications().then(setNotifications).catch(() => {});
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  const worstRoadRisk = roadRisks.reduce((worst, r) => (!worst || r.risk_score > worst.risk_score ? r : worst), null);
  const riskElevated = worstRoadRisk && (worstRoadRisk.risk_level === 'orange' || worstRoadRisk.risk_level === 'red');

  const calculateRoutes = async () => {
    setError(''); setCalculating(true); setRouteResult(null);
    try {
      const origin = locations.find((l) => String(l.id) === originId);
      const dest = locations.find((l) => String(l.id) === destId);
      if (!origin || !dest) throw new Error('Pick both a starting location and a drop-off location.');
      const result = await planningApi.optimizeRoute({
        origin_district_id: origin.district_id, dest_district_id: dest.district_id,
        priority: selectedShipment.priority, shipment_id: selectedShipment.id
      });
      setRouteResult(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setCalculating(false);
    }
  };

  const startJourney = async (routeId) => {
    setError(''); setStarting(true);
    try {
      await driverApi.startJourney(selectedShipment.id, routeId);
      setRouteResult(null);
      setRerouteOptions(null);
      loadVehicleAndShipments();
    } catch (err) {
      setError(err.message);
    } finally {
      setStarting(false);
    }
  };

  const findAlternateRoute = async () => {
    setFindingAlternate(true);
    try {
      const origin = locations.find((l) => String(l.id) === originId);
      const dest = locations.find((l) => String(l.id) === destId);
      const result = await planningApi.optimizeRoute({
        origin_district_id: origin.district_id, dest_district_id: dest.district_id,
        priority: selectedShipment.priority, shipment_id: selectedShipment.id
      });
      // Only offer routes that actually differ from the one already
      // assigned - between some locations the road network genuinely has
      // just one path, and silently re-offering the same route as an
      // "alternative" would look broken rather than honestly say so.
      const currentRoadIds = (currentRoute?.road_ids || []).slice().sort().join(',');
      const genuinelyDifferent = (result.routes || []).filter(
        (r) => r.road_ids.slice().sort().join(',') !== currentRoadIds
      );
      setRerouteOptions({ ...result, routes: genuinelyDifferent, noAlternativeExists: genuinelyDifferent.length === 0 });
    } catch (err) {
      setError(err.message);
    } finally {
      setFindingAlternate(false);
    }
  };

  const finishAndPickNext = () => {
    setSelectedShipmentId(null);
    setRouteResult(null);
    loadVehicleAndShipments();
  };

  if (!vehicle) {
    return (
      <div className="max-w-lg mx-auto mt-12 bg-gray-900 border border-gray-800 rounded-lg p-6 text-center">
        <div className="text-4xl mb-2">🚚</div>
        <div className="font-medium mb-1">No vehicle linked to your account</div>
        <div className="text-sm text-gray-500">Ask an admin to link a vehicle to your driver profile in Administration.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-xl font-semibold">🚚 My Journey — {vehicle.number}</h1>
      <PipelineBreadcrumb phase={phase} riskElevated={riskElevated} />

      {phase === 'pick' && (
        <ShipmentPicker
          shipments={shipments} selectedShipment={selectedShipment} setSelectedShipment={(s) => setSelectedShipmentId(s.id)}
          locations={locations} originId={originId} setOriginId={setOriginId} destId={destId} setDestId={setDestId}
          onCalculate={calculateRoutes} calculating={calculating} error={error}
        />
      )}

      {phase === 'plan' && routeResult && (
        <RouteChoice
          routeResult={routeResult} onStart={startJourney} starting={starting} error={error}
          onBack={() => setRouteResult(null)}
        />
      )}

      {phase === 'transit' && (
        <TransitView
          vehicle={vehicle} shipment={selectedShipment} currentRoute={currentRoute} navSteps={navSteps}
          worstRoadRisk={worstRoadRisk} riskElevated={riskElevated}
          notifications={notifications}
          rerouteOptions={rerouteOptions} onFindAlternate={findAlternateRoute} findingAlternate={findingAlternate}
          onReroute={startJourney} starting={starting}
        />
      )}

      {phase === 'delivered' && (
        <div className="bg-green-950 border border-green-800 rounded-lg p-6 text-center space-y-3">
          <div className="text-4xl">✅</div>
          <div className="text-lg font-semibold text-green-200">Delivery complete</div>
          <div className="text-sm text-green-300">{selectedShipment?.shipment_code} delivered successfully.</div>
          <button onClick={finishAndPickNext} className="bg-green-700 hover:bg-green-600 rounded px-4 py-2 text-sm mt-2">
            View next assigned shipment
          </button>
        </div>
      )}
    </div>
  );
}

function PipelineBreadcrumb({ phase, riskElevated }) {
  const activeIndex = { pick: 0, plan: 1, transit: riskElevated ? 5 : 3, delivered: 8 }[phase];
  return (
    <div className="flex flex-wrap gap-1 text-xs">
      {PIPELINE.map((label, i) => (
        <span key={label} className={`px-2 py-1 rounded ${i <= activeIndex ? 'bg-blue-700 text-white' : 'bg-gray-800 text-gray-500'}`}>
          {label}
        </span>
      ))}
    </div>
  );
}

function ShipmentPicker({ shipments, selectedShipment, setSelectedShipment, locations, originId, setOriginId, destId, setDestId, onCalculate, calculating, error }) {
  if (shipments.length === 0) {
    return <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-center text-gray-500">No shipment currently assigned to your vehicle.</div>;
  }
  return (
    <div className="space-y-3">
      {shipments.length > 1 && (
        <div className="flex gap-2">
          {shipments.map((s) => (
            <button key={s.id} onClick={() => setSelectedShipment(s)}
              className={`text-xs px-3 py-1.5 rounded ${selectedShipment?.id === s.id ? 'bg-blue-700' : 'bg-gray-800'}`}>
              {s.shipment_code}
            </button>
          ))}
        </div>
      )}
      {selectedShipment && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
          <div className="flex justify-between items-start">
            <div>
              <div className="font-medium">{selectedShipment.shipment_code} · <span className="capitalize">{selectedShipment.cargo_type.replaceAll('_', ' ')}</span></div>
              <div className="text-xs text-gray-500">{selectedShipment.cargo_quantity}</div>
            </div>
            <Badge tone={{ critical: 'critical', high: 'high', medium: 'medium', low: 'low' }[selectedShipment.priority]}>{selectedShipment.priority}</Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-xs text-gray-400 flex flex-col gap-1">
              📍 Starting location (pick up)
              <select value={originId} onChange={(e) => setOriginId(e.target.value)} className="input">
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
            <label className="text-xs text-gray-400 flex flex-col gap-1">
              🏁 Drop-off location
              <select value={destId} onChange={(e) => setDestId(e.target.value)} className="input">
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
          </div>

          <button onClick={onCalculate} disabled={calculating} className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 rounded py-2 text-sm font-medium">
            {calculating ? 'Calculating route...' : 'View Recommended Route'}
          </button>
          {error && <div className="text-xs text-red-400">{error}</div>}
        </div>
      )}
    </div>
  );
}

function RouteChoice({ routeResult, onStart, starting, error, onBack }) {
  const routes = routeResult.routes || [];
  return (
    <div className="space-y-3">
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-2 h-[320px]">
        <MapView routeCandidates={routes} height="100%" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {routes.map((route) => (
          <div key={route.id} className="bg-gray-900 border border-gray-800 rounded-lg p-3 text-sm">
            <div className="flex justify-between items-center mb-1">
              <span className="font-semibold uppercase text-xs">{route.status}</span>
              <Badge tone={RISK_TONE[route.risk_level]}>{route.risk_level} · {route.risk_score}/100</Badge>
            </div>
            <div className="text-gray-400 text-xs mb-2">{route.distance_km} km · {(route.duration_minutes / 60).toFixed(1)} h</div>
            <div className="text-xs mb-2">via {route.road_names.join(' → ')}</div>
            <div className="text-xs text-gray-300 mb-2">{route.explanation}</div>
            <button onClick={() => onStart(route.id)} disabled={starting}
              className="w-full bg-green-700 hover:bg-green-600 disabled:bg-gray-700 rounded py-1.5 text-xs font-medium">
              {starting ? 'Starting...' : '▶ Start Journey on this route'}
            </button>
          </div>
        ))}
      </div>
      {error && <div className="text-xs text-red-400">{error}</div>}
      <button onClick={onBack} className="text-xs text-gray-500 hover:text-gray-300">← Back to shipment</button>
    </div>
  );
}

function TransitView({ vehicle, shipment, currentRoute, navSteps = [], worstRoadRisk, riskElevated, notifications, rerouteOptions, onFindAlternate, findingAlternate, onReroute, starting }) {
  // Stable references across polls unless something meaningful actually
  // changed - otherwise MapView's route layer would clearLayers()+fitBounds
  // on every 4s poll tick even when the route hasn't changed, which is both
  // wasteful and (combined with marker updates firing around the same time)
  // was the trigger for a real Leaflet internal-state error.
  const routeCandidatesForMap = useMemo(
    () => (currentRoute ? [{ ...currentRoute, status: 'recommended' }] : []),
    [currentRoute?.id]
  );
  const vehiclesForMap = useMemo(
    () => [vehicle],
    [vehicle.id, vehicle.lat, vehicle.lng, vehicle.status, vehicle.speed_kmh]
  );

  return (
    <div className="space-y-3">
      {riskElevated && (
        <div className="bg-orange-950 border-2 border-orange-700 rounded-lg p-4">
          <div className="font-semibold text-orange-200 mb-1">⚠️ Risk increased on your route</div>
          <div className="text-sm text-orange-300 mb-2">
            {worstRoadRisk.name}: risk {worstRoadRisk.risk_score}/100 ({worstRoadRisk.risk_level}). {worstRoadRisk.risk_factors?.slice(0, 2).join('; ')}
          </div>
          {!rerouteOptions ? (
            <button onClick={onFindAlternate} disabled={findingAlternate} className="bg-orange-700 hover:bg-orange-600 disabled:bg-gray-700 rounded px-3 py-1.5 text-xs font-medium">
              {findingAlternate ? 'Searching...' : '🔀 Find Alternate Route'}
            </button>
          ) : rerouteOptions.noAlternativeExists ? (
            <div className="text-xs text-orange-200 bg-orange-900/40 border border-orange-800 rounded p-2 mt-2">
              No safer alternative route exists between these two locations in the road network - this is
              currently the only available path. Proceed with caution; authorities have been notified.
            </div>
          ) : (
            <div className="space-y-2 mt-2">
              {rerouteOptions.routes.map((route) => (
                <div key={route.id} className="bg-gray-900 border border-gray-800 rounded p-2 flex justify-between items-center text-xs">
                  <div>
                    <Badge tone={RISK_TONE[route.risk_level]}>{route.status} · {route.risk_score}/100</Badge>
                    <span className="ml-2 text-gray-400">{route.distance_km}km via {route.road_names.join(', ')}</span>
                  </div>
                  <button onClick={() => onReroute(route.id)} disabled={starting} className="bg-green-700 hover:bg-green-600 rounded px-2 py-1">
                    {starting ? '...' : 'Reroute here'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 space-y-3">
          <NavigationPanel navSteps={navSteps} vehicle={vehicle} currentRoute={currentRoute} />
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-2 h-[420px]">
            <MapView vehicles={vehiclesForMap} routeCandidates={routeCandidatesForMap} height="100%" />
          </div>
        </div>
        <div className="space-y-3">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 text-sm">
            <div className="font-medium mb-1">📦 {shipment?.shipment_code}</div>
            <div className="text-xs text-gray-400">Status: <span className="capitalize">{vehicle.status.replaceAll('_', ' ')}</span></div>
            <div className="text-xs text-gray-400">Speed: {vehicle.speed_kmh ?? 0} km/h</div>
            <div className="text-xs text-gray-400">Progress: {Math.round((vehicle.route_progress ?? 0) * 100)}%</div>
            <div className="w-full bg-gray-800 rounded-full h-2 mt-1 overflow-hidden">
              <div className="bg-blue-500 h-2" style={{ width: `${Math.round((vehicle.route_progress ?? 0) * 100)}%` }} />
            </div>
          </div>

          {currentRoute && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 text-sm">
              <div className="font-medium mb-1">🛣️ Current Route Risk</div>
              <Badge tone={RISK_TONE[worstRoadRisk?.risk_level] || 'green'}>{worstRoadRisk?.risk_level ?? 'green'} · {worstRoadRisk?.risk_score ?? 0}/100</Badge>
            </div>
          )}

          <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 text-sm max-h-52 overflow-auto">
            <div className="font-medium mb-2">🔔 Alerts</div>
            {notifications.slice(0, 5).map((n) => (
              <div key={n.notification_id} className="text-xs text-gray-300 border-t border-gray-800 pt-1 mt-1 first:border-0 first:pt-0 first:mt-0">{n.message_en}</div>
            ))}
            {notifications.length === 0 && <div className="text-xs text-gray-500">No alerts.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

// Maneuver arrows, matching what the instruction says to do.
const MANEUVER_ARROW = {
  left: '↰', right: '↱', 'slight left': '↖', 'slight right': '↗',
  'sharp left': '⬅', 'sharp right': '➡', straight: '⬆', uturn: '⤶'
};

function maneuverArrow(step) {
  if (!step) return '🏁';
  if (step.maneuver_type === 'arrive') return '🏁';
  if (step.maneuver_type === 'depart') return '⬆';
  return MANEUVER_ARROW[step.modifier] || '⬆';
}

function formatDistance(metres) {
  if (metres == null) return '--';
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres)} m`;
}

function formatDuration(minutes) {
  if (minutes == null || !isFinite(minutes)) return '--';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * Turn-by-turn navigation panel. The steps themselves come from OSRM (real
 * maneuvers on real roads); which step is CURRENT is derived from the
 * vehicle's route progress against the steps' cumulative distances, so it
 * advances as the vehicle moves.
 */
function NavigationPanel({ navSteps, vehicle, currentRoute }) {
  const progress = Math.min(1, Math.max(0, vehicle?.route_progress ?? 0));

  const nav = useMemo(() => {
    if (!navSteps || navSteps.length === 0) return null;
    const total = navSteps.reduce((s, st) => s + (st.distance_m || 0), 0);
    if (total <= 0) return null;

    const travelled = progress * total;
    let cumulative = 0;
    let index = navSteps.length - 1;
    for (let i = 0; i < navSteps.length; i++) {
      cumulative += navSteps[i].distance_m || 0;
      if (travelled < cumulative) { index = i; break; }
    }
    const endOfCurrent = navSteps.slice(0, index + 1).reduce((s, st) => s + (st.distance_m || 0), 0);
    return {
      current: navSteps[index],
      next: navSteps[index + 1] || null,
      distanceToTurn: Math.max(0, endOfCurrent - travelled),
      remainingDistance: Math.max(0, total - travelled),
      stepNumber: index + 1,
      totalSteps: navSteps.length
    };
  }, [navSteps, progress]);

  if (!nav) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 text-sm text-gray-500">
        🧭 Turn-by-turn directions unavailable for this route (routing service unreachable) - live map tracking below still works.
      </div>
    );
  }

  const totalMinutes = currentRoute?.duration_minutes ?? 0;
  const remainingMinutes = totalMinutes * (1 - progress);
  const arrival = new Date(Date.now() + remainingMinutes * 60000);

  return (
    <div className="rounded-lg overflow-hidden border border-teal-800">
      {/* Current maneuver - the big "Turn right" banner */}
      <div className="bg-teal-900 p-4 flex items-center gap-4">
        <div className="text-4xl leading-none">{maneuverArrow(nav.current)}</div>
        <div className="flex-1 min-w-0">
          <div className="text-xl font-semibold text-white truncate">{nav.current.instruction}</div>
          <div className="text-sm text-teal-200">in {formatDistance(nav.distanceToTurn)}</div>
        </div>
        <div className="text-xs text-teal-300 shrink-0">Step {nav.stepNumber}/{nav.totalSteps}</div>
      </div>

      {/* Next maneuver preview */}
      {nav.next && (
        <div className="bg-teal-950 px-4 py-2 flex items-center gap-3 text-sm text-teal-200 border-t border-teal-900">
          <span className="text-gray-400">Then</span>
          <span className="text-lg">{maneuverArrow(nav.next)}</span>
          <span className="truncate">{nav.next.instruction}</span>
        </div>
      )}

      {/* Trip summary bar */}
      <div className="bg-gray-900 px-4 py-2 flex items-center gap-4 text-sm border-t border-gray-800">
        <span className="text-green-400 font-semibold">{formatDuration(remainingMinutes)}</span>
        <span className="text-gray-400">{formatDistance(nav.remainingDistance)}</span>
        <span className="text-gray-400">
          {arrival.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
        <span className="ml-auto text-gray-400">{Math.round(vehicle?.speed_kmh ?? 0)} km/h</span>
      </div>
    </div>
  );
}
