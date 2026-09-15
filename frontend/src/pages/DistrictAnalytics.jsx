import React, { useEffect, useState } from 'react';
import Badge from '../components/Badge.jsx';
import { analyticsApi } from '../services/api.js';

const RISK_TONE = { low: 'green', moderate: 'yellow', high: 'orange', critical: 'red' };

export default function DistrictAnalytics() {
  const [rows, setRows] = useState([]);
  const [sortBy, setSortBy] = useState('connectivity_score');

  useEffect(() => { analyticsApi.districtConnectivity().then(setRows).catch(() => {}); }, []);

  const sorted = [...rows].sort((a, b) => (sortBy === 'connectivity_score' ? a[sortBy] - b[sortBy] : String(a[sortBy]).localeCompare(String(b[sortBy]))));

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">MODULE 12 · District Connectivity Score</h1>
      <div className="bg-yellow-950 border border-yellow-800 rounded-lg p-3 text-xs text-yellow-200">
        ⚠️ This is a <strong>platform-generated analytical metric</strong> (roads accessible, live weather risk,
        open incidents, transport-hub availability) - it is <strong>not</strong> an official government statistic.
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-auto">
        <table className="w-full text-sm">
          <thead className="text-gray-500 text-xs">
            <tr>
              <th className="text-left p-3 cursor-pointer" onClick={() => setSortBy('district_name')}>District</th>
              <th className="text-left cursor-pointer" onClick={() => setSortBy('connectivity_score')}>Connectivity Score</th>
              <th className="text-left">Risk</th>
              <th className="text-left">Major Bottleneck</th>
              <th className="text-left">Active Incidents</th>
              <th className="text-left">Roads (accessible / monitored)</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((d) => (
              <tr key={d.district_id} className="border-t border-gray-800">
                <td className="p-3 font-medium">{d.district_name}</td>
                <td>
                  <div className="w-32 bg-gray-800 rounded-full h-2 overflow-hidden">
                    <div className={`h-2 ${d.connectivity_score >= 75 ? 'bg-green-500' : d.connectivity_score >= 50 ? 'bg-yellow-500' : d.connectivity_score >= 25 ? 'bg-orange-500' : 'bg-red-500'}`} style={{ width: `${d.connectivity_score}%` }} />
                  </div>
                  <span className="text-xs text-gray-400">{d.connectivity_score}/100</span>
                </td>
                <td><Badge tone={RISK_TONE[d.risk]}>{d.risk}</Badge></td>
                <td className="text-xs text-gray-400">{d.major_bottleneck ?? '-'}</td>
                <td>{d.active_incidents}</td>
                <td className="text-xs">{d.roads_accessible} / {d.roads_monitored}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
