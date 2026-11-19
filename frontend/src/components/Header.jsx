import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut } from 'lucide-react';
import BrandMark from './BrandMark.jsx';
import { registerBackHandler } from '../native/backNavigation.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function Header() {
  const { owner, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (open) return registerBackHandler(() => setOpen(false));
  }, [open]);

  // Close the profile menu when tapping outside it
  useEffect(() => {
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, []);

  const initial = (owner?.name || '?').charAt(0).toUpperCase();

  return (
    <header className="app-header sticky top-0 z-30 border-b border-slate-100 bg-white/90 backdrop-blur">
      <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <span className="lg:hidden"><BrandMark className="h-10 w-10" /></span>
          <div className="min-w-0">
            <p className="truncate font-bold text-slate-900">{owner?.pgName}</p>
            <p className="hidden text-xs text-slate-500 sm:block">Owner dashboard</p>
          </div>
          {owner?.isDemo && (
            <span className="shrink-0 rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-bold text-orange-700">
              Demo data
            </span>
          )}
        </div>

        <div className="relative shrink-0" ref={ref}>
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex min-h-11 min-w-11 items-center gap-2 rounded-xl p-1 pr-2 hover:bg-slate-50"
            aria-label="Open profile menu"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-500 font-bold text-white">
              {initial}
            </span>
            <span className="hidden text-left text-sm sm:block">
              <span className="block font-semibold leading-tight text-slate-800">{owner?.name}</span>
            </span>
            <ChevronDown size={16} className="hidden text-slate-400 sm:block" />
          </button>

          {open && (
            <div className="absolute right-0 mt-2 w-60 animate-fade-in rounded-2xl border border-slate-100 bg-white p-2 shadow-lg">
              <div className="px-3 py-2">
                <p className="truncate font-semibold text-slate-800">{owner?.name}</p>
                <p className="truncate text-xs text-slate-500">{owner?.email}</p>
              </div>
              <button
                onClick={logout}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50"
              >
                <LogOut size={16} /> Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
