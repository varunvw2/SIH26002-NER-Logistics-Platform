import { GPSProvider } from './GPSProvider.js';

// Interpolates a position a fixed step further along the route's coordinate
// list. `progress` (0-1) is tracked by the caller (vehicleSimulator service)
// and persisted between ticks; this class is a pure function of its inputs
// so it's easy to unit test.
export class SimulationProvider extends GPSProvider {
  async getNextPosition(vehicle, route, progress, stepFraction = 0.08) {
    const coords = route?.coordinates ?? [];
    if (coords.length < 2) return { lat: vehicle.lat, lng: vehicle.lng, speed_kmh: 0, progress: 1 };

    const nextProgress = Math.min(1, progress + stepFraction);
    const idxFloat = nextProgress * (coords.length - 1);
    const i = Math.floor(idxFloat);
    const frac = idxFloat - i;
    const [lngA, latA] = coords[i];
    const [lngB, latB] = coords[Math.min(i + 1, coords.length - 1)];

    const lat = latA + (latB - latA) * frac;
    const lng = lngA + (lngB - lngA) * frac;
    const speed_kmh = 45 + Math.random() * 25;

    return { lat, lng, speed_kmh: Number(speed_kmh.toFixed(1)), progress: nextProgress };
  }
}
