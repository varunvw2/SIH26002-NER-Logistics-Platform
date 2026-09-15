import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export function ProtectedRoute({ children, roles }) {
  const { user, ready } = useAuth();
  if (!ready) return <div className="p-8 text-gray-400">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    return (
      <div className="p-8">
        <div className="bg-red-950 border border-red-800 rounded-lg p-6 text-red-200">
          You don't have permission to view this page ({user.role} is not one of: {roles.join(', ')}).
        </div>
      </div>
    );
  }
  return children;
}
