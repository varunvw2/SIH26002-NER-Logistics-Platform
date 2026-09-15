// Interface:
//   class RoutingProvider {
//     async getRoadGeometry(fromLngLat, toLngLat) -> [[lng,lat], ...] | null
//   }
//
// Used only at seed time (see db/seed.js) to give each named road a real,
// road-snapped path instead of a straight line between district centroids -
// purely visual/geometric. It never influences risk scoring or which route
// wins; that stays entirely in services/riskEngine.js + routeOptimizer.js.
export class RoutingProvider {
  async getRoadGeometry(_fromLngLat, _toLngLat) {
    throw new Error('Not implemented');
  }
}
