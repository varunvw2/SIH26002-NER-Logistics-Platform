import { OSRMProvider } from '../providers/routing/OSRMProvider.js';

// Turn-by-turn navigation steps for an already-computed route.
//
// The route's own stored polyline is sampled down to a handful of waypoints
// and re-run through OSRM with steps=true, so the maneuvers follow the
// SPECIFIC road this route chose (important where several parallel roads
// connect the same two districts) rather than whatever OSRM would consider
// shortest between the endpoints.
//
// Routes are immutable once created, so results are cached by route id -
// the driver's screen polls, and this must not hit OSRM on every tick.

const cache = new Map(); // routeId -> steps[]

function sampleWaypoints(coordinates, max = 10) {
  if (coordinates.length <= max) return coordinates;
  const stride = (coordinates.length - 1) / (max - 1);
  const out = [];
  for (let i = 0; i < max; i++) out.push(coordinates[Math.round(i * stride)]);
  return out;
}

function instructionText(step) {
  const type = step.maneuver?.type;
  const modifier = step.maneuver?.modifier;
  const onto = step.name ? ` onto ${step.name}` : '';
  const along = step.name ? ` on ${step.name}` : '';

  switch (type) {
    case 'depart': return `Start${along}`;
    case 'arrive': return 'Arrive at destination';
    // OSRM emits turn/straight for "carry on through this junction" - saying
    // "Turn straight" reads wrong to a driver.
    case 'turn': return modifier === 'straight' ? `Continue straight${onto}` : `Turn ${modifier || 'ahead'}${onto}`;
    case 'end of road': return `Turn ${modifier || 'ahead'}${onto}`;
    case 'new name': return `Continue${along}`;
    case 'continue': return `Continue ${modifier || 'straight'}${along}`;
    case 'merge': return `Merge ${modifier || ''}${onto}`.replace('  ', ' ');
    case 'on ramp': return `Take the ramp${onto}`;
    case 'off ramp': return `Take the exit${onto}`;
    case 'fork': return `Keep ${modifier || 'straight'}${onto}`;
    case 'roundabout':
    case 'rotary': return `Take the roundabout${onto}`;
    case 'roundabout turn': return `At the roundabout, turn ${modifier || 'ahead'}${onto}`;
    default: return `${type || 'Continue'}${modifier ? ` ${modifier}` : ''}${onto}`;
  }
}

export async function getNavigationSteps(route) {
  if (cache.has(route.id)) return cache.get(route.id);

  const coordinates = JSON.parse(route.coordinates_json || '[]');
  if (coordinates.length < 2) return [];

  const waypoints = sampleWaypoints(coordinates);
  const rawAll = await new OSRMProvider().getTurnByTurn(waypoints);
  if (!rawAll) return []; // OSRM unavailable - caller shows the map without steps

  // Routing through N sampled waypoints produces N-1 legs, and OSRM ends
  // every leg with an 'arrive' and starts every leg with a 'depart'. Those
  // are waypoint-stitching artifacts, not real maneuvers - without stripping
  // them the driver sees "Arrive at destination" a third of the way into the
  // trip. Keep only the very first depart and the very last arrive.
  const raw = rawAll.filter((s, i) => {
    const type = s.maneuver?.type;
    if (type === 'depart') return i === 0;
    if (type === 'arrive') return i === rawAll.length - 1;
    return true;
  });

  const steps = raw.map((s) => ({
    instruction: instructionText(s),
    maneuver_type: s.maneuver?.type ?? null,
    modifier: s.maneuver?.modifier ?? null,
    road_name: s.name || null,
    distance_m: Math.round(s.distance ?? 0),
    duration_s: Math.round(s.duration ?? 0),
    location: s.maneuver?.location ?? null // [lng, lat]
  }));

  cache.set(route.id, steps);
  return steps;
}
