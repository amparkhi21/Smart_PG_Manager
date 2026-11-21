import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import Header from '../components/Header.jsx';
import BottomNav from '../components/BottomNav.jsx';
import { NotificationProvider } from '../context/NotificationContext.jsx';

export default function AppLayout() {
  return (
    <NotificationProvider><div className="min-h-dvh lg:pl-64">
      <Sidebar />
      <div className="flex min-h-dvh min-w-0 flex-col">
        <Header />
        <main className="app-content mx-auto min-w-0 w-full max-w-7xl flex-1 animate-fade-in px-4 py-5 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div></NotificationProvider>
  );
}
