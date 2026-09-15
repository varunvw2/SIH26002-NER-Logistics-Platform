export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

function getToken() {
  return localStorage.getItem('sih_token');
}

async function request(path, { method = 'GET', body, isForm = false, token } = {}) {
  const headers = {};
  const authToken = token ?? getToken();
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  if (!isForm && body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body)
  });

  if (res.status === 401) {
    onUnauthorized();
    throw new ApiError('Unauthorized', 401);
  }

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data?.details);
  }
  return data;
}

// --- Auth --------------------------------------------------------------
export const authApi = {
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  register: (payload) => request('/auth/register', { method: 'POST', body: payload }),
  me: (token) => request('/auth/me', { token })
};

// --- Catalog (GIS / Module 1) -------------------------------------------
export const catalogApi = {
  states: () => request('/states'),
  districts: (stateId) => request(`/districts${stateId ? `?state_id=${stateId}` : ''}`),
  district: (id) => request(`/districts/${id}`),
  roads: (params = {}) => request(`/roads?${new URLSearchParams(params)}`),
  road: (id) => request(`/roads/${id}`),
  setRoadStatus: (id, status) => request(`/roads/${id}/status`, { method: 'PATCH', body: { status } }),
  bridges: () => request('/bridges'),
  locations: (params = {}) => request(`/locations?${new URLSearchParams(params)}`)
};

// --- Fleet / Module 5 ----------------------------------------------------
export const fleetApi = {
  vehicles: (params = {}) => request(`/vehicles?${new URLSearchParams(params)}`),
  vehicle: (id) => request(`/vehicles/${id}`),
  patchGps: (id, payload) => request(`/vehicles/${id}/gps`, { method: 'PATCH', body: payload }),
  simulateTick: (id) => request(`/vehicles/${id}/simulate-tick`, { method: 'POST' }),
  assignRoute: (id, routeId) => request(`/vehicles/${id}/assign-route`, { method: 'POST', body: { route_id: routeId } }),
  drivers: () => request('/drivers')
};

// --- Driver Journey (Login -> Assigned Shipment -> ... -> Delivery) --------
export const driverApi = {
  myVehicle: () => request('/driver/me/vehicle'),
  myShipments: () => request('/driver/me/shipments'),
  startJourney: (shipmentId, routeId) => request('/driver/me/journey/start', { method: 'POST', body: { shipment_id: shipmentId, route_id: routeId } })
};

// --- Shipments / Module 9 --------------------------------------------------
export const shipmentsApi = {
  list: (params = {}) => request(`/shipments?${new URLSearchParams(params)}`),
  get: (id) => request(`/shipments/${id}`),
  create: (payload) => request('/shipments', { method: 'POST', body: payload }),
  setStatus: (id, status) => request(`/shipments/${id}/status`, { method: 'PATCH', body: { status } })
};

// --- Incidents / Modules 6+7 -------------------------------------------------
export const incidentsApi = {
  list: (params = {}) => request(`/incidents?${new URLSearchParams(params)}`),
  create: (formData) => request('/incidents', { method: 'POST', body: formData, isForm: true }),
  verify: (id, payload) => request(`/incidents/${id}/verify`, { method: 'PATCH', body: payload }),
  photoUrl: (id) => `${API_URL}/incidents/${id}/photo`,
  submitFieldReport: (payload) => request('/field-reports', { method: 'POST', body: payload })
};

// --- Weather -------------------------------------------------------------
export const weatherApi = {
  all: () => request('/weather'),
  district: (id) => request(`/weather/districts/${id}`)
};

// --- Planning (Modules 2+3+4) ----------------------------------------------
export const planningApi = {
  optimizeRoute: (payload) => request('/routes/optimize', { method: 'POST', body: payload }),
  route: (id) => request(`/routes/${id}`),
  navigation: (id) => request(`/routes/${id}/navigation`),
  predictions: () => request('/risk/predictions')
};

// --- Alerts / Module 8 -----------------------------------------------------
export const alertsApi = {
  list: (params = {}) => request(`/alerts?${new URLSearchParams(params)}`),
  notifications: (unreadOnly) => request(`/notifications${unreadOnly ? '?unread=true' : ''}`),
  markRead: (id) => request(`/notifications/${id}/read`, { method: 'PATCH' })
};

// --- Analytics / Modules 11-13 ----------------------------------------------
export const analyticsApi = {
  kpis: () => request('/analytics/kpis'),
  districtConnectivity: () => request('/analytics/district-connectivity'),
  bottlenecks: (limit) => request(`/analytics/bottlenecks${limit ? `?limit=${limit}` : ''}`),
  incidentTrend: () => request('/analytics/incident-trend')
};

// --- Emergency / Module 10 --------------------------------------------------
export const emergencyApi = {
  state: () => request('/emergency/state')
};

// --- Admin -----------------------------------------------------------------
export const adminApi = {
  users: () => request('/admin/users'),
  createUser: (payload) => request('/admin/users', { method: 'POST', body: payload }),
  setRole: (id, role) => request(`/admin/users/${id}/role`, { method: 'PATCH', body: { role } }),
  auditLogs: () => request('/admin/audit-logs')
};

export { ApiError };
