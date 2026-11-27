import { NavLink } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import BrandMark from './BrandMark.jsx';
import { NAV } from '../utils/nav.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function Sidebar() {
  const { owner, logout } = useAuth();
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-navy-900 text-white lg:flex">
      <div className="flex items-center gap-3 px-6 py-6">
        <BrandMark className="h-10 w-10" />
        <div className="leading-tight">
          <p className="font-extrabold">Smart PG</p>
          <p className="text-xs text-navy-200">Manager</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                isActive ? 'bg-white/10 text-white' : 'text-navy-200 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={19} className={isActive ? 'text-orange-400' : ''} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/10 p-4">
        <p className="truncate text-sm font-semibold">{owner?.pgName}</p>
        <p className="mb-3 truncate text-xs text-navy-200">{owner?.email}</p>
        <button
          onClick={logout}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 py-2.5 text-sm font-semibold hover:bg-white/20"
        >
          <LogOut size={16} /> Log out
        </button>
      </div>
    </aside>
  );
}
