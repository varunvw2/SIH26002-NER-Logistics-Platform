import React, { useEffect, useState } from 'react';
import Badge from '../components/Badge.jsx';
import { analyticsApi } from '../services/api.js';

const RISK_TONE = { green: 'green', yellow: 'yellow', orange: 'orange', red: 'red' };

export default function Bottlenecks() {
  const [rows, setRows] = useState([]);
  useEffect(() => { analyticsApi.bottlenecks(15).then(setRows).catch(() => {}); }, []);

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">MODULE 13 · Logistics Bottleneck Analysis</h1>
      <p className="text-sm text-gray-400">
        Roads with a real incident history, ranked by frequency - helps identify where infrastructure
        investment would reduce repeat disruptions.
      </p>

      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-auto">
        <table className="w-full text-sm">
          <thead className="text-gray-500 text-xs">
            <tr>
              <th className="text-left p-3">Road / Corridor</th>
              <th className="text-left">Total Incidents</th>
              <th className="text-left">Last 90 Days</th>
              <th className="text-left">Current Risk</th>
              <th className="text-left">Avg Delay</th>
              <th className="text-left">Affected Shipments</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.road_id} className="border-t border-gray-800">
                <td className="p-3 font-medium">{r.road_name}</td>
                <td>{r.incident_count}</td>
                <td>{r.historical_frequency_last_90_days}</td>
                <td><Badge tone={RISK_TONE[r.current_risk_level]}>{r.current_risk_score}/100</Badge></td>
                <td>{r.avg_delay_minutes != null ? `${Math.round(r.avg_delay_minutes)} min` : '-'}</td>
                <td>{r.affected_shipments}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="p-4 text-gray-500">No roads with recorded incidents yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
