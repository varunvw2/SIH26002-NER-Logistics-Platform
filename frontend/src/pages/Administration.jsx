import React, { useEffect, useState } from 'react';
import Badge from '../components/Badge.jsx';
import { adminApi } from '../services/api.js';

const ROLES = ['admin', 'authority_officer', 'logistics_manager', 'field_officer', 'driver', 'viewer'];

export default function Administration() {
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'viewer', language: 'en' });
  const [error, setError] = useState('');

  const loadUsers = () => adminApi.users().then(setUsers).catch(() => {});
  useEffect(() => { loadUsers(); adminApi.auditLogs().then(setAuditLogs).catch(() => {}); }, []);

  const setRole = async (id, role) => { await adminApi.setRole(id, role); loadUsers(); };

  const createUser = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await adminApi.createUser(form);
      setShowForm(false);
      setForm({ name: '', email: '', password: '', role: 'viewer', language: 'en' });
      loadUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Administration</h1>
      <div className="flex gap-2">
        <button onClick={() => setTab('users')} className={`text-sm px-3 py-1.5 rounded ${tab === 'users' ? 'bg-blue-700' : 'bg-gray-800'}`}>Users & Roles</button>
        <button onClick={() => setTab('audit')} className={`text-sm px-3 py-1.5 rounded ${tab === 'audit' ? 'bg-blue-700' : 'bg-gray-800'}`}>Audit Logs</button>
      </div>

      {tab === 'users' && (
        <>
          <button onClick={() => setShowForm((s) => !s)} className="bg-blue-600 hover:bg-blue-700 rounded px-3 py-1.5 text-sm">
            {showForm ? 'Cancel' : '+ Create User'}
          </button>
          {showForm && (
            <form onSubmit={createUser} className="bg-gray-900 border border-gray-800 rounded-lg p-4 grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <input required placeholder="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input" />
              <input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="input" />
              <input required type="password" placeholder="Password (min 8 chars)" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} className="input" />
              <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className="input">
                {ROLES.map((r) => <option key={r} value={r}>{r.replaceAll('_', ' ')}</option>)}
              </select>
              <div className="col-span-full flex items-center gap-3">
                <button type="submit" className="bg-green-700 hover:bg-green-600 rounded px-4 py-1.5">Create</button>
                {error && <span className="text-red-400 text-xs">{error}</span>}
              </div>
            </form>
          )}

          <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-gray-500 text-xs"><tr><th className="text-left p-3">Name</th><th className="text-left">Email</th><th className="text-left">Role</th><th className="text-left">Created</th></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-gray-800">
                    <td className="p-3">{u.name}</td>
                    <td className="text-xs text-gray-400">{u.email}</td>
                    <td>
                      <select value={u.role} onChange={(e) => setRole(u.id, e.target.value)} className="input text-xs">
                        {ROLES.map((r) => <option key={r} value={r}>{r.replaceAll('_', ' ')}</option>)}
                      </select>
                    </td>
                    <td className="text-xs text-gray-500">{new Date(u.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'audit' && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-gray-500 text-xs"><tr><th className="text-left p-3">When</th><th className="text-left">User</th><th className="text-left">Action</th><th className="text-left">Entity</th></tr></thead>
            <tbody>
              {auditLogs.map((a) => (
                <tr key={a.id} className="border-t border-gray-800">
                  <td className="p-3 text-xs text-gray-500">{new Date(a.created_at).toLocaleString()}</td>
                  <td className="text-xs">{a.user_name ?? 'system'}</td>
                  <td><Badge tone="gray">{a.action}</Badge></td>
                  <td className="text-xs text-gray-400">{a.entity_type} #{a.entity_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
