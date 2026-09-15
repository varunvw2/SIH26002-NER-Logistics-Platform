import { createApp } from './app.js';
import { tickAllActiveVehicles } from './services/vehicleSimulator.js';
import { tickWeatherSimulation } from './services/weatherSimulator.js';

const app = createApp();
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`SIH26002 backend running on http://localhost:${PORT}`);
  console.log(`API base: http://localhost:${PORT}/api`);
});

// Background "pseudo-real-time" GPS simulation: every 5s, advance every
// in-transit vehicle a step along its assigned route. This is what makes
// vehicles move on the dashboard map without the frontend having to poll a
// tick endpoint itself. Swappable: once vehicles report real GPS via
// PATCH /vehicles/:id/gps, this loop simply has nothing to advance for them.
setInterval(() => {
  tickAllActiveVehicles().catch(err => console.error('Vehicle simulation loop error:', err.message));
}, 5000);

// Background weather drift: every 30s, nudges each district's rainfall
// (random walk with occasional larger swings). The risk engine already
// reads the latest weather_records row on every call, so this is the only
// change needed to make risk scores/route rankings genuinely shift over
// time instead of only reacting to incidents. Only runs against the mock
// provider - once OPENWEATHER_API_KEY is set, a real feed is in charge of
// this data and simulating fake drift on top of it would be pointless.
if (!process.env.OPENWEATHER_API_KEY) {
  setInterval(() => {
    try { tickWeatherSimulation(); } catch (err) { console.error('Weather simulation loop error:', err.message); }
  }, 30000);
}
