import { lazy, Suspense } from 'react';
import Login from './pages/Login.jsx';
import ResidentChangePassword from './pages/ResidentChangePassword.jsx';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute, PublicRoute } from './components/ProtectedRoute.jsx';
import AppLayout from './layouts/AppLayout.jsx';
import ResidentLayout from './layouts/ResidentLayout.jsx';

const Register = lazy(() => import('./pages/Register.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Rooms = lazy(() => import('./pages/Rooms.jsx'));
const Residents = lazy(() => import('./pages/Residents.jsx'));
const ResidentProfile = lazy(() => import('./pages/ResidentProfile.jsx'));
const Attendance = lazy(() => import('./pages/Attendance.jsx'));
const ResidentAttendance = lazy(() => import('./pages/ResidentAttendance.jsx'));
const Rent = lazy(() => import('./pages/Rent.jsx'));
const Electricity = lazy(() => import('./pages/Electricity.jsx'));
const PaymentHistory = lazy(() => import('./pages/PaymentHistory.jsx'));
const Reminders = lazy(() => import('./pages/Reminders.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const Reports = lazy(() => import('./pages/Reports.jsx'));
const ResidentLogin = lazy(() => import('./pages/ResidentLogin.jsx'));
const ResidentDashboard = lazy(() => import('./pages/ResidentDashboard.jsx'));
const ResidentAccount = lazy(() => import('./pages/ResidentAccount.jsx'));
const ResidentMyRoom = lazy(() => import('./pages/ResidentMyRoom.jsx'));
const ResidentRoomAvailability = lazy(() => import('./pages/ResidentRoomAvailability.jsx'));
const MessManagement = lazy(() => import('./pages/MessManagement.jsx'));
const ResidentMessMenu = lazy(() => import('./pages/ResidentMessMenu.jsx'));
const Community = lazy(() => import('./pages/Community.jsx'));
const NoticeBoard = lazy(() => import('./pages/NoticeBoard.jsx'));
const ResidentPayments = lazy(() => import('./pages/ResidentPayments.jsx'));
const ResidentContacts = lazy(() => import('./pages/ResidentContacts.jsx'));
const Notifications = lazy(() => import('./pages/Notifications.jsx'));
const Requests = lazy(() => import('./pages/Requests.jsx'));

export default function App() {
  return (
    <Suspense fallback={<div className="grid min-h-dvh place-items-center text-sm text-slate-500" role="status">Loading page…</div>}>
      <Routes>
        <Route element={<PublicRoute />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/owner/login" element={<Login />} />
          <Route path="/owner/register" element={<Register />} />
          <Route path="/resident/login" element={<ResidentLogin />} />
          <Route path="/resident/join" element={<Navigate to="/resident/login" replace />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="rooms" element={<Rooms />} />
            <Route path="requests" element={<Requests ownerView />} />
            <Route path="room-change-requests" element={<Navigate to="/requests" replace />} />
            <Route path="mess-management" element={<MessManagement />} />
            <Route path="community" element={<Community />} />
            <Route path="notice-board" element={<NoticeBoard />} />
            <Route path="residents" element={<Residents />} />
            <Route path="residents/:id" element={<ResidentProfile />} />
            <Route path="attendance" element={<Attendance />} />
            <Route path="rent" element={<Rent />} />
            <Route path="electricity" element={<Electricity />} />
            <Route path="payments" element={<PaymentHistory />} />
            <Route path="payment-requests" element={<Navigate to="/requests" replace />} />
            <Route path="complaints" element={<Navigate to="/requests" replace />} />
            <Route path="leave-requests" element={<Navigate to="/requests" replace />} />
            <Route path="emergency-contacts" element={<ResidentContacts />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="reports" element={<Reports />} />
            <Route path="reminders" element={<Reminders />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
        <Route element={<ProtectedRoute role="resident" />}>
          <Route element={<ResidentLayout />}>
            <Route path="/resident/dashboard" element={<ResidentDashboard />} />
            <Route path="/resident/profile" element={<ResidentAccount />} />
            <Route path="/resident/attendance" element={<ResidentAttendance />} />
            <Route path="/resident/change-password" element={<ResidentChangePassword />} />
            <Route path="/resident/my-room" element={<ResidentMyRoom />} />
            <Route path="/resident/rooms" element={<ResidentRoomAvailability />} />
            <Route path="/resident/requests" element={<Requests />} />
            <Route path="/resident/room-change-requests" element={<Navigate to="/resident/requests" replace />} />
            <Route path="/resident/mess-menu" element={<ResidentMessMenu />} />
            <Route path="/resident/community" element={<Community />} />
            <Route path="/resident/notices" element={<NoticeBoard />} />
            <Route path="/resident/payments" element={<ResidentPayments />} />
            <Route path="/resident/complaints" element={<Navigate to="/resident/requests" replace />} />
            <Route path="/resident/leave-requests" element={<Navigate to="/resident/requests" replace />} />
            <Route path="/resident/emergency-contacts" element={<Navigate to="/resident/profile" replace />} />
            <Route path="/resident/notifications" element={<Notifications />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
