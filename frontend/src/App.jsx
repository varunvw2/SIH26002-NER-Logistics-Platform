import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { SyncProvider } from './context/SyncContext.jsx';
import { ProtectedRoute } from './components/ProtectedRoute.jsx';
import Layout from './components/Layout.jsx';

import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import NERMap from './pages/NERMap.jsx';
import RoutePlanner from './pages/RoutePlanner.jsx';
import VehicleTracking from './pages/VehicleTracking.jsx';
import Shipments from './pages/Shipments.jsx';
import Incidents from './pages/Incidents.jsx';
import FieldReporting from './pages/FieldReporting.jsx';
import Alerts from './pages/Alerts.jsx';
import EmergencyMode from './pages/EmergencyMode.jsx';
import DistrictAnalytics from './pages/DistrictAnalytics.jsx';
import Bottlenecks from './pages/Bottlenecks.jsx';
import WeatherRisk from './pages/WeatherRisk.jsx';
import Administration from './pages/Administration.jsx';
import Profile from './pages/Profile.jsx';
import DriverJourney from './pages/DriverJourney.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SyncProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Dashboard />} />
              <Route path="/my-journey" element={<ProtectedRoute roles={['admin', 'driver']}><DriverJourney /></ProtectedRoute>} />
              <Route path="/map" element={<NERMap />} />
              <Route path="/route-planner" element={<ProtectedRoute roles={['admin', 'logistics_manager']}><RoutePlanner /></ProtectedRoute>} />
              <Route path="/vehicles" element={<ProtectedRoute roles={['admin', 'logistics_manager', 'driver']}><VehicleTracking /></ProtectedRoute>} />
              <Route path="/shipments" element={<ProtectedRoute roles={['admin', 'logistics_manager']}><Shipments /></ProtectedRoute>} />
              <Route path="/incidents" element={<Incidents />} />
              <Route path="/field-reporting" element={<ProtectedRoute roles={['admin', 'field_officer', 'authority_officer']}><FieldReporting /></ProtectedRoute>} />
              <Route path="/alerts" element={<Alerts />} />
              <Route path="/emergency" element={<ProtectedRoute roles={['admin', 'authority_officer', 'logistics_manager']}><EmergencyMode /></ProtectedRoute>} />
              <Route path="/district-analytics" element={<DistrictAnalytics />} />
              <Route path="/bottlenecks" element={<Bottlenecks />} />
              <Route path="/weather-risk" element={<WeatherRisk />} />
              <Route path="/admin" element={<ProtectedRoute roles={['admin']}><Administration /></ProtectedRoute>} />
              <Route path="/profile" element={<Profile />} />
            </Route>
          </Routes>
        </SyncProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
