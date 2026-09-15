import React from 'react';

export default function StatCard({ label, value, tone = 'blue', icon }) {
  const bg = {
    blue: 'bg-blue-950 border-blue-900', red: 'bg-red-950 border-red-900',
    orange: 'bg-orange-950 border-orange-900', green: 'bg-green-950 border-green-900',
    gray: 'bg-gray-900 border-gray-800'
  }[tone] || 'bg-gray-900 border-gray-800';

  return (
    <div className={`rounded-lg border p-4 ${bg}`}>
      <div className="flex items-center justify-between text-gray-400 text-xs uppercase tracking-wide">
        <span>{label}</span>
        {icon && <span className="text-base">{icon}</span>}
      </div>
      <div className="text-3xl font-bold mt-1">{value}</div>
    </div>
  );
}
