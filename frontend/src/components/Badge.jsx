import React from 'react';

const COLORS = {
  green: 'bg-green-900 text-green-300 border-green-700',
  yellow: 'bg-yellow-900 text-yellow-300 border-yellow-700',
  orange: 'bg-orange-900 text-orange-300 border-orange-700',
  red: 'bg-red-900 text-red-300 border-red-700',
  low: 'bg-green-900 text-green-300 border-green-700',
  medium: 'bg-yellow-900 text-yellow-300 border-yellow-700',
  high: 'bg-orange-900 text-orange-300 border-orange-700',
  critical: 'bg-red-900 text-red-300 border-red-700',
  gray: 'bg-gray-800 text-gray-300 border-gray-700'
};

export default function Badge({ tone = 'gray', children }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${COLORS[tone] || COLORS.gray}`}>
      {children}
    </span>
  );
}
