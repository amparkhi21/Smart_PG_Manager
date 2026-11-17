import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute, PublicRoute } from './components/ProtectedRoute.jsx';
import AppLayout from './layouts/AppLayout.jsx';

const Login = lazy(() => import('./pages/Login.jsx'));
const Register = lazy(() => import('./pages/Register.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Rooms = lazy(() => import('./pages/Rooms.jsx'));
const Residents = lazy(() => import('./pages/Residents.jsx'));
const ResidentProfile = lazy(() => import('./pages/ResidentProfile.jsx'));
const Attendance = lazy(() => import('./pages/Attendance.jsx'));
const Rent = lazy(() => import('./pages/Rent.jsx'));
const Electricity = lazy(() => import('./pages/Electricity.jsx'));
const PaymentHistory = lazy(() => import('./pages/PaymentHistory.jsx'));
const Reminders = lazy(() => import('./pages/Reminders.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const Reports = lazy(() => import('./pages/Reports.jsx'));

export default function App() {
  return (
    <Suspense fallback={<div className="grid min-h-dvh place-items-center text-sm text-slate-500" role="status">Loading page…</div>}>
      <Routes>
        <Route element={<PublicRoute />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="rooms" element={<Rooms />} />
            <Route path="residents" element={<Residents />} />
            <Route path="residents/:id" element={<ResidentProfile />} />
            <Route path="attendance" element={<Attendance />} />
            <Route path="rent" element={<Rent />} />
            <Route path="electricity" element={<Electricity />} />
            <Route path="payments" element={<PaymentHistory />} />
            <Route path="reports" element={<Reports />} />
            <Route path="reminders" element={<Reminders />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}