import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute, PublicRoute } from './components/ProtectedRoute.jsx';
import AppLayout from './layouts/AppLayout.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Rooms from './pages/Rooms.jsx';
import Residents from './pages/Residents.jsx';
import ResidentProfile from './pages/ResidentProfile.jsx';
import Attendance from './pages/Attendance.jsx';
import Rent from './pages/Rent.jsx';
import Electricity from './pages/Electricity.jsx';
import PaymentHistory from './pages/PaymentHistory.jsx';
import ComingSoon from './pages/ComingSoon.jsx';

export default function App() {
  return (
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
          <Route path="reminders" element={<ComingSoon title="Reminders" step="3F" />} />
          <Route path="settings" element={<ComingSoon title="Settings" step="3F" />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}