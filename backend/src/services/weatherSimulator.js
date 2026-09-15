import { db } from '../db/index.js';
import { createAlert } from './alertEngine.js';

// Makes weather the one piece of "live" data that was previously frozen at
// whatever seed.js wrote once. A random-walk drift per district (occasional
// larger swings, to simulate a storm arriving/clearing) means the risk
// engine - which already reads the latest weather_records row on every
// call - now genuinely reacts over time, not just in response to incidents.
//
// This intentionally reuses the existing weather_records table as a log
// (one new row per tick, MockWeatherProvider already reads "ORDER BY
// recorded_at DESC LIMIT 1") rather than adding new schema.

const KEEP_ROWS_PER_DISTRICT = 20;

function driftRainfall(current) {
  const bigMove = Math.random() < 0.15; // ~15% chance of a storm arriving/clearing
  const delta = bigMove ? (Math.random() - 0.5) * 40 : (Math.random() - 0.5) * 10;
  return Math.max(0, Math.min(90, Math.round(current + delta)));
}

function conditionFor(mm) {
  if (mm > 40) return 'heavy_rain';
  if (mm > 20) return 'moderate_rain';
  if (mm > 5) return 'light_rain';
  return 'clear';
}

function noteFor(mm) {
  if (mm > 40) return 'Heavy rainfall - elevated landslide/flood risk';
  if (mm > 20) return 'Moderate rainfall - monitor conditions';
  return 'No significant rainfall expected';
}

export function tickWeatherSimulation() {
  const districts = db.prepare('SELECT id, name FROM districts').all();

  for (const d of districts) {
    const latest = db.prepare(
      'SELECT rainfall_mm FROM weather_records WHERE district_id = ? ORDER BY recorded_at DESC LIMIT 1'
    ).get(d.id);
    const prevMM = latest?.rainfall_mm ?? 10;
    const nextMM = driftRainfall(prevMM);

    db.prepare(`
      INSERT INTO weather_records (district_id, rainfall_mm, condition, forecast_note, source)
      VALUES (?, ?, ?, ?, 'mock')
    `).run(d.id, nextMM, conditionFor(nextMM), noteFor(nextMM));

    db.prepare(`
      DELETE FROM weather_records WHERE district_id = ? AND id NOT IN (
        SELECT id FROM weather_records WHERE district_id = ? ORDER BY recorded_at DESC LIMIT ?
      )
    `).run(d.id, d.id, KEEP_ROWS_PER_DISTRICT);

    // MODULE 4 - crossing into heavy rain raises a genuine predictive alert
    // (forward-looking wording, not a confirmed incident), reusing the same
    // targeted-alert mechanism incidents use.
    if (prevMM <= 40 && nextMM > 40) {
      const params = { road: `${d.name} district roads`, reason: `rainfall rising to ${nextMM}mm` };
      createAlert({ type: 'predicted_disruption', severity: 'high', params, target_role: 'logistics_manager', target_district_id: d.id, is_prediction: true });
      createAlert({ type: 'predicted_disruption', severity: 'high', params, target_role: 'authority_officer', target_district_id: d.id, is_prediction: true });
    }
  }
}
