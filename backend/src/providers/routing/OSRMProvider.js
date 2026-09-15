import { RoutingProvider } from './RoutingProvider.js';

// Real adapter: OSRM's free public demo server (no API key, fair-use only -
// this is why it's called once per road at seed time, not per request).
// Matches the spec's own suggested stack (OSRM) for "don't build a routing
// engine from scratch". Falls back to null on any failure so the caller can
// keep its straight-line waypoints instead - the app must never hard-fail
// just because a third-party demo service is slow/unavailable.
export class OSRMProvider extends RoutingProvider {
  /**
   * @param {[number,number]} fromLngLat
   * @param {[number,number]} toLngLat
   * @param {[number,number][]} [viaWaypoints] - optional intermediate points
   *   to route through, in order (OSRM accepts multiple coordinates per
   *   request) - used so visually-distinct demo roads that share the same
   *   endpoints don't collapse onto the same real-world shortest path.
   */
  async getRoadGeometry(fromLngLat, toLngLat, viaWaypoints = []) {
    try {
      const points = [fromLngLat, ...viaWaypoints, toLngLat].map(([lng, lat]) => `${lng},${lat}`).join(';');
      // overview=simplified (not 'full') - full detail on a 400km+ highway
      // can be 10,000+ points, which every poller (roads are re-fetched every
      // few seconds by multiple pages, with risk recomputed each time) would
      // have to re-serialize/re-parse constantly. Simplified still traces
      // the real road, just without redundant nearly-collinear points.
      const url = `https://router.project-osrm.org/route/v1/driving/${points}?overview=simplified&geometries=geojson`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`OSRM API ${res.status}`);
      const data = await res.json();
      const coords = data.routes?.[0]?.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) throw new Error('No geometry in OSRM response');
      return coords;
    } catch (error) {
      console.warn('OSRMProvider failed, falling back to straight-line geometry:', error.message);
      return null;
    }
  }

  /**
   * Turn-by-turn maneuvers along a path defined by the given ordered
   * waypoints. Returns OSRM's raw step objects (all legs flattened), or null
   * on failure so the caller can degrade to a map-only view rather than
   * breaking the driver's screen.
   * @param {[number,number][]} waypoints - ordered [lng,lat] points
   */
  async getTurnByTurn(waypoints) {
    try {
      if (!Array.isArray(waypoints) || waypoints.length < 2) return null;
      const points = waypoints.map(([lng, lat]) => `${lng},${lat}`).join(';');
      const url = `https://router.project-osrm.org/route/v1/driving/${points}?overview=false&steps=true`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`OSRM API ${res.status}`);
      const data = await res.json();
      const legs = data.routes?.[0]?.legs;
      if (!Array.isArray(legs)) throw new Error('No legs in OSRM response');
      return legs.flatMap((leg) => leg.steps ?? []);
    } catch (error) {
      console.warn('OSRMProvider turn-by-turn failed:', error.message);
      return null;
    }
  }
}
