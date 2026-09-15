import { WeatherProvider } from './WeatherProvider.js';
import { db } from '../../db/index.js';

// Reads the latest seeded/simulated weather_records row for the district so
// the demo has stable, explainable numbers instead of pure randomness on
// every request. A "Simulated data" badge is shown wherever this is used in
// the UI (source = 'mock').
export class MockWeatherProvider extends WeatherProvider {
  async getDistrictWeather(districtId) {
    const row = db.prepare(
      `SELECT rainfall_mm, condition, forecast_note, source, recorded_at
       FROM weather_records WHERE district_id = ? ORDER BY recorded_at DESC LIMIT 1`
    ).get(districtId);

    if (row) return row;

    return { rainfall_mm: 0, condition: 'clear', forecast_note: 'No data', source: 'mock', recorded_at: null };
  }
}
