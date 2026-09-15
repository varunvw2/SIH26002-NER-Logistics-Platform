import { MockWeatherProvider } from './MockWeatherProvider.js';
import { OpenWeatherProvider } from './OpenWeatherProvider.js';

// Factory: picks the real provider only if a key is configured, otherwise
// mock. This is the single place that decides which adapter is active.
export function getWeatherProvider() {
  if (process.env.OPENWEATHER_API_KEY) {
    return new OpenWeatherProvider(process.env.OPENWEATHER_API_KEY);
  }
  return new MockWeatherProvider();
}
