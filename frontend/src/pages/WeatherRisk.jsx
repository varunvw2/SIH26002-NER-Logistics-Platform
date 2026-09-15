import React, { useEffect, useState } from 'react';
import Badge from '../components/Badge.jsx';
import { weatherApi, catalogApi, planningApi } from '../services/api.js';

const RISK_TONE = { green: 'green', yellow: 'yellow', orange: 'orange', red: 'red' };

export default function WeatherRisk() {
  const [weather, setWeather] = useState([]);
  const [roads, setRoads] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [tab, setTab] = useState('roads');

  useEffect(() => {
    // Weather drifts server-side every ~30s (see backend/src/services/
    // weatherSimulator.js) and road risk is recomputed from it on every
    // request, so poll rather than fetch once.
    const load = () => {
      weatherApi.all().then(setWeather).catch(() => {});
      catalogApi.roads().then(setRoads).catch(() => {});
      planningApi.predictions().then(setPredictions).catch(() => {});
    };
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">MODULE 2+4 · Weather & Road Risk (decision support, not a guarantee)</h1>

      <div className="flex gap-2">
        <button onClick={() => setTab('roads')} className={`text-sm px-3 py-1.5 rounded ${tab === 'roads' ? 'bg-blue-700' : 'bg-gray-800'}`}>Road risk</button>
        <button onClick={() => setTab('weather')} className={`text-sm px-3 py-1.5 rounded ${tab === 'weather' ? 'bg-blue-700' : 'bg-gray-800'}`}>District weather</button>
        <button onClick={() => setTab('predictions')} className={`text-sm px-3 py-1.5 rounded ${tab === 'predictions' ? 'bg-blue-700' : 'bg-gray-800'}`}>Predictive warnings</button>
      </div>

      {tab === 'roads' && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-gray-500 text-xs"><tr><th className="text-left p-3">Road</th><th className="text-left">Risk score</th><th className="text-left">Level</th><th className="text-left">Contributing factors</th></tr></thead>
            <tbody>
              {roads.map((r) => (
                <tr key={r.id} className="border-t border-gray-800">
                  <td className="p-3">{r.name}</td>
                  <td className="font-semibold">{r.risk_score}/100</td>
                  <td><Badge tone={RISK_TONE[r.risk_level]}>{r.risk_level}</Badge></td>
                  <td className="text-xs text-gray-400">{r.risk_factors?.join('; ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'weather' && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-auto">
          {weather.some((w) => w.source === 'openweather') ? (
            <div className="p-2 text-xs text-green-400">
              🟢 Live weather from OpenWeatherMap where available (per-district cache refreshes every ~10 min); districts without a live reading fall back to simulated data (marked below).
            </div>
          ) : (
            <div className="p-2 text-xs text-yellow-400">
              🟡 Simulated weather data for this demo (see backend/src/providers/weather - swappable for a real OpenWeatherMap key).
            </div>
          )}
          <table className="w-full text-sm">
            <thead className="text-gray-500 text-xs"><tr><th className="text-left p-3">District</th><th className="text-left">Rainfall</th><th className="text-left">Condition</th><th className="text-left">Source</th><th className="text-left">Note</th></tr></thead>
            <tbody>
              {weather.map((w) => (
                <tr key={w.district_id} className="border-t border-gray-800">
                  <td className="p-3">{w.district_name}</td>
                  <td className={w.rainfall_mm > 40 ? 'text-red-400 font-semibold' : w.rainfall_mm > 20 ? 'text-orange-400' : ''}>{w.rainfall_mm} mm</td>
                  <td className="capitalize">{w.condition.replaceAll('_', ' ')}</td>
                  <td><Badge tone={w.source === 'openweather' ? 'green' : 'yellow'}>{w.source === 'openweather' ? 'live' : 'simulated'}</Badge></td>
                  <td className="text-xs text-gray-400">{w.forecast_note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'predictions' && (
        <div className="space-y-2">
          {predictions.map((p) => (
            <div key={p.road_id} className="bg-gray-900 border border-gray-800 rounded-lg p-3 text-sm">
              <div className="flex justify-between mb-1">
                <span className="font-medium">{p.road_name}</span>
                <Badge tone={RISK_TONE[p.risk_level]}>{p.risk_score}/100</Badge>
              </div>
              <div className="text-yellow-300 text-xs">{p.predictive_warning}</div>
              <div className="text-xs text-gray-500 mt-1">{p.factors.join('; ')}</div>
            </div>
          ))}
          {predictions.length === 0 && <div className="text-gray-500 text-sm">No elevated-risk roads right now - nothing to predict.</div>}
        </div>
      )}
    </div>
  );
}
