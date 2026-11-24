import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { MoreHorizontal, LogOut } from 'lucide-react';
import { NAV, MOBILE_PRIMARY } from '../utils/nav.js';
import { useAuth } from '../context/AuthContext.jsx';
import Modal from './ui/Modal.jsx';

export default function BottomNav() {
  const { logout } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const primary = NAV.filter((n) => MOBILE_PRIMARY.includes(n.to));
  const more = NAV.filter((n) => !MOBILE_PRIMARY.includes(n.to));

  return (
    <>
      <nav aria-label="Main navigation" className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white lg:hidden">
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {primary.map(({ to, short, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                aria-label={label}
                className={({ isActive }) =>
                  `flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${
                    isActive ? 'text-navy-900' : 'text-slate-400'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={`rounded-full px-4 py-1 ${isActive ? 'bg-orange-100 text-orange-600' : ''}`}>
                      <Icon size={20} />
                    </span>
                    {short}
                  </>
                )}
              </NavLink>
            </li>
          ))}
          <li>
            <button
              onClick={() => setMoreOpen(true)}
              className="flex min-h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-semibold text-slate-400"
            >
              <span className="px-4 py-1">
                <MoreHorizontal size={20} />
              </span>
              More
            </button>
          </li>
        </ul>
      </nav>

      {moreOpen && (
        <Modal title="More" onClose={() => setMoreOpen(false)}>
            <div className="grid grid-cols-3 gap-3">
              {more.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setMoreOpen(false)}
                  className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl bg-slate-50 text-xs font-semibold text-slate-700 active:bg-slate-100"
                >
                  <Icon size={22} className="text-navy-700" />
                  {label}
                </NavLink>
              ))}
              <button
                onClick={logout}
                className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl bg-rose-50 text-xs font-semibold text-rose-600"
              >
                <LogOut size={22} />
                Log out
              </button>
            </div>
        </Modal>
      )}
    </>
  );
}
