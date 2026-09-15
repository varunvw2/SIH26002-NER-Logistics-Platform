import React from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { LANGUAGES } from '../i18n/strings.js';

export default function Profile() {
  const { user, language, setLanguage } = useAuth();

  return (
    <div className="max-w-lg space-y-4">
      <h1 className="text-xl font-semibold">Profile & Settings</h1>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-2 text-sm">
        <Row label="Name" value={user?.name} />
        <Row label="Email" value={user?.email} />
        <Row label="Role" value={user?.role?.replaceAll('_', ' ')} className="capitalize" />
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-2">
        <div className="text-sm font-medium">Notification language</div>
        <p className="text-xs text-gray-500 mb-2">Applies to alert/notification wording across the platform.</p>
        <select value={language} onChange={(e) => setLanguage(e.target.value)} className="input">
          {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-xs text-gray-500">
        SIH26002 - AI-Based Smart Logistics and Accessibility Intelligence Platform for NER.
        Built as a hackathon prototype: SQLite (not PostgreSQL+PostGIS), rule-based risk/route
        engine (not trained ML), and simulated weather/GPS/AI-image data where a real integration
        would otherwise be required. See README.md and docs/ for the full disclosure and
        production migration path.
      </div>
    </div>
  );
}

function Row({ label, value, className = '' }) {
  return (
    <div className="flex justify-between border-b border-gray-800 pb-2">
      <span className="text-gray-500">{label}</span>
      <span className={className}>{value}</span>
    </div>
  );
}
