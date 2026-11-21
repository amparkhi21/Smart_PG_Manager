import { Link } from 'react-router-dom';
import { Building2, GraduationCap, ShieldCheck } from 'lucide-react';
import BrandMark from '../components/BrandMark.jsx';

const roles = [
  { to: '/owner/login', icon: Building2, title: "I'm an Owner", text: 'Manage your PG, residents, rooms, payments, and hostel operations.', tone: 'bg-orange-50 text-orange-600' },
  { to: '/resident/login', icon: GraduationCap, title: "I'm a Resident / Student", text: 'Access your room information, bills, mess menu, and hostel services.', tone: 'bg-teal-50 text-teal-700' },
];

export default function RoleSelection() {
  return <main className="auth-content flex min-h-dvh flex-col items-center justify-center px-5">
    <div className="w-full max-w-3xl animate-fade-in">
      <div className="mb-10 flex items-center justify-center gap-3"><BrandMark className="h-14 w-14" /><span className="text-lg font-extrabold text-navy-900">Smart PG Manager</span></div>
      <div className="text-center"><p className="mb-3 text-sm font-bold uppercase tracking-widest text-teal-700">One place. Your PG.</p>
        <h1 className="text-3xl font-extrabold tracking-tight text-navy-900 sm:text-4xl">Welcome to Smart PG Manager</h1>
        <p className="mt-4 text-lg text-slate-600">Choose your role to continue</p>
      </div>
      <div className="mt-9 grid gap-4 sm:grid-cols-2">
        {roles.map(({ to, icon: Icon, title, text, tone }) => <Link key={to} to={to}
          className="card group flex min-w-0 flex-col items-start p-6 transition duration-200 hover:-translate-y-1 hover:border-teal-300 hover:shadow-lg focus-visible:border-teal-500 sm:p-8">
          <span className={`mb-6 flex h-14 w-14 items-center justify-center rounded-2xl ${tone}`}><Icon size={28} /></span>
          <h2 className="text-xl font-extrabold text-navy-900">{title}</h2><p className="mt-3 flex-1 leading-relaxed text-slate-600">{text}</p>
          <span className="mt-6 text-sm font-bold text-teal-700">Continue</span>
        </Link>)}
      </div>
      <p className="mt-7 flex items-center justify-center gap-2 text-center text-sm text-slate-500"><ShieldCheck size={17} className="shrink-0" /> Resident accounts are provided by your PG owner.</p>
    </div>
  </main>;
}
