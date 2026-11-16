import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import Header from '../components/Header.jsx';
import BottomNav from '../components/BottomNav.jsx';

export default function AppLayout() {
  return (
    <div className="min-h-dvh lg:pl-64">
      <Sidebar />
      <div className="flex min-h-dvh flex-col">
        <Header />
        <main className="mx-auto w-full max-w-7xl flex-1 animate-fade-in px-4 py-5 pb-28 sm:px-6 lg:px-8 lg:pb-10">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  );
}