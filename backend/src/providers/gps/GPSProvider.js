// Interface:
//   class GPSProvider {
//     async getNextPosition(vehicle, route) -> { lat, lng, speed_kmh }
//   }
//
// SimulationProvider (default) advances a vehicle along its assigned route's
// coordinates for the hackathon demo. A real MobileGPSProvider needs no
// server-side class at all - the driver's phone browser (Geolocation API)
// simply POSTs real coordinates to the same PATCH /api/vehicles/:id/gps
// endpoint used here, so swapping in real GPS is a client-side change only.
export class GPSProvider {
  async getNextPosition(_vehicle, _route) {
    throw new Error('Not implemented');
  }
}
