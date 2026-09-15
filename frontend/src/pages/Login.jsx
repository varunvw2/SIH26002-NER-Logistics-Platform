import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const DEMO_ACCOUNTS = [
  ['admin@sih.gov.in', 'System Administrator'],
  ['authority@sih.gov.in', 'Authority Officer'],
  ['manager@sih.gov.in', 'Logistics Manager'],
  ['field@sih.gov.in', 'Field Officer'],
  ['driver1@sih.gov.in', 'Driver'],
  ['viewer@sih.gov.in', 'Viewer / Analyst']
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('manager@sih.gov.in');
  const [password, setPassword] = useState('Demo@1234');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="text-3xl mb-1">🇮🇳 NER Logistics Intelligence</div>
          <div className="text-sm text-gray-500">SIH26002 - Ministry of Development of North Eastern Region</div>
        </div>

        <form onSubmit={submit} className="bg-gray-900 border border-gray-800 rounded-lg p-6 space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Email</label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Password</label>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
            />
          </div>
          {error && <div className="text-sm text-red-400">{error}</div>}
          <button
            type="submit" disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 rounded py-2 font-medium"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div className="mt-4 bg-gray-900/60 border border-gray-800 rounded-lg p-4 text-xs text-gray-400">
          <div className="font-medium text-gray-300 mb-2">Demo accounts (password: Demo@1234)</div>
          <div className="grid grid-cols-1 gap-1">
            {DEMO_ACCOUNTS.map(([demoEmail, role]) => (
              <button
                key={demoEmail}
                type="button"
                onClick={() => { setEmail(demoEmail); setPassword('Demo@1234'); }}
                className="text-left hover:text-blue-400 flex justify-between"
              >
                <span>{demoEmail}</span><span className="text-gray-600">{role}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
