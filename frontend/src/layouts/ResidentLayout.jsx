import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LogOut, Menu, X } from 'lucide-react';
import BrandMark from '../components/BrandMark.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { RESIDENT_NAV } from '../utils/residentNav.js';
import { registerBackHandler } from '../native/backNavigation.js';
import { NotificationProvider } from '../context/NotificationContext.jsx';
import NotificationBell from '../components/NotificationBell.jsx';

export default function ResidentLayout() {
  const { resident, logout } = useAuth();
  const [expanded, setExpanded] = useState(false);
  useEffect(() => expanded ? registerBackHandler(() => setExpanded(false)) : undefined, [expanded]);
  return <NotificationProvider><div className="min-h-dvh lg:pl-72">
    <header className="app-header sticky top-0 z-30 border-b border-slate-200 bg-white">
      <div className="flex min-h-18 items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3"><BrandMark /><div className="min-w-0"><p className="truncate font-extrabold text-navy-900">{resident.pgName}</p><p className="text-sm text-slate-500">Resident portal</p></div></div>
        <div className="flex shrink-0 items-center gap-2"><NotificationBell /><button type="button" className="btn-secondary lg:hidden" aria-expanded={expanded} aria-controls="resident-nav" aria-label={expanded ? 'Close navigation' : 'Open navigation'} onClick={() => setExpanded((value) => !value)}>{expanded ? <X size={20} /> : <Menu size={20} />}</button>
        <button className="btn-secondary hidden lg:inline-flex" onClick={logout}><LogOut size={16} /> Logout</button></div>
      </div>
    </header>
    <aside id="resident-nav" className={`${expanded ? 'block' : 'hidden'} border-b border-slate-200 bg-navy-900 p-4 text-white lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:block lg:w-72 lg:overflow-y-auto lg:border-0 lg:p-5`}>
      <div className="mb-5 hidden items-center gap-3 lg:flex"><BrandMark /><p className="font-extrabold">Smart PG Manager</p></div>
      <p className="mb-4 text-sm text-navy-200">Your resident account</p>
      <nav aria-label="Resident navigation" className="space-y-1">
        {RESIDENT_NAV.filter((item) => !resident.passwordChangeRequired || item.label === 'Settings').map(({ label, to }) => to
          ? <NavLink key={label} to={to} onClick={() => setExpanded(false)} className={({ isActive }) => `flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold ${isActive ? 'bg-white/10 text-orange-300' : 'text-navy-100 hover:bg-white/5'}`}>{label}</NavLink>
          : <div key={label} className="flex min-h-11 items-center justify-between gap-2 px-3 text-sm text-navy-200"><span>{label}</span><span className="shrink-0 text-xs">Coming soon</span></div>)}
      </nav>
      <button className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-white/10 text-sm font-semibold hover:bg-white/20" onClick={logout}><LogOut size={16} /> Logout</button>
    </aside>
    <main className="app-content mx-auto w-full min-w-0 max-w-5xl px-4 py-6 sm:px-6"><Outlet /></main>
  </div></NotificationProvider>;
}
