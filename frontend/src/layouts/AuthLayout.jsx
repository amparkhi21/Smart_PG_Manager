import { IndianRupee, Zap, MessageCircle } from 'lucide-react';
import BrandMark from '../components/BrandMark.jsx';
import { Link } from 'react-router-dom';

const POINTS = [
  { icon: IndianRupee, text: 'Track rent and partial payments' },
  { icon: Zap, text: 'Electricity bills calculated for you' },
  { icon: MessageCircle, text: 'WhatsApp reminders in one tap' },
];

export default function AuthLayout({ title, subtitle, children, resident = false }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-navy-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-orange-500/20" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-teal-500/10" />
        <div className="relative flex items-center gap-3">
          <BrandMark />
          <p className="text-xl font-extrabold">Smart PG Manager</p>
        </div>
        <div className="relative">
          <h2 className="text-4xl font-extrabold leading-tight">
            {resident ? 'Your place,' : 'Your whole PG,'}
            <br />
            <span className="text-orange-400">one app.</span>
          </h2>
          {resident ? <p className="mt-8 max-w-sm text-navy-100">A personal space for your PG account. Sign in with the details provided by your owner.</p> : <ul className="mt-8 space-y-4">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-navy-100">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10">
                  <Icon size={18} className="text-teal-300" />
                </span>
                {text}
              </li>
            ))}
          </ul>}
        </div>
        <p className="relative text-sm text-navy-200">No more registers and notebooks.</p>
      </div>

      <div className="auth-content flex min-w-0 items-center justify-center px-5 py-10">
        <div className="w-full max-w-md animate-fade-in">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandMark />
            <p className="text-lg font-extrabold text-navy-900">Smart PG Manager</p>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900">{title}</h1>
          <Link to="/" className="my-3 inline-flex min-h-11 items-center text-sm font-semibold text-teal-700 hover:text-teal-800">Change Role</Link>
          <p className="mb-6 mt-1 text-slate-500">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
