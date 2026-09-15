import { WeatherProvider } from './WeatherProvider.js';
import { db } from '../../db/index.js';

// Real adapter for OpenWeatherMap's free tier, used only when
// OPENWEATHER_API_KEY is configured. Falls back to the mock reading (with a
// console warning) on any network/API failure so the demo never hard-fails
// because an external service is unavailable - per the "modular ingestion,
// mock fallback" requirement.

// Module-level (not per-instance) cache: getWeatherProvider() constructs a
// new OpenWeatherProvider on every call (see index.js), and this app polls
// road/risk data every few seconds across several pages - each poll needs
// weather for every district a road touches. Without caching, a handful of
// browser tabs open at once would trivially blow through OpenWeatherMap's
// free-tier rate limit, silently degrading to mock data mid-demo. Weather
// doesn't meaningfully change second to second anyway, so a short TTL keeps
// this "real-time" in any practical sense while protecting the quota.
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const cache = new Map(); // districtId -> { data, expiresAt }

export class OpenWeatherProvider extends WeatherProvider {
  constructor(apiKey) {
    super();
    this.apiKey = apiKey;
  }

  async getDistrictWeather(districtId) {
    const cached = cache.get(districtId);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    try {
      const district = db.prepare('SELECT lat, lng FROM districts WHERE id = ?').get(districtId);
      if (!district) throw new Error('Unknown district');

      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${district.lat}&lon=${district.lng}&appid=${this.apiKey}&units=metric`;
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) throw new Error(`OpenWeather API ${res.status}`);
      const data = await res.json();

      const rainfall_mm = data.rain?.['1h'] ?? data.rain?.['3h'] ?? 0;
      const condition = (data.weather?.[0]?.main || 'clear').toLowerCase();

      const result = {
        rainfall_mm,
        condition,
        forecast_note: data.weather?.[0]?.description || '-',
        source: 'openweather'
      };
      cache.set(districtId, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
      return result;
    } catch (error) {
      console.warn('OpenWeatherProvider failed, falling back to mock:', error.message);
      const { MockWeatherProvider } = await import('./MockWeatherProvider.js');
      const fallback = await new MockWeatherProvider().getDistrictWeather(districtId);
      // Cache the fallback too (briefly) so a rate-limited/down window
      // doesn't retry every single poll - just every TTL.
      cache.set(districtId, { data: fallback, expiresAt: Date.now() + CACHE_TTL_MS });
      return fallback;
    }
  }
}
