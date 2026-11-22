import { Link } from 'react-router-dom';
import { Building2, DoorOpen, CalendarDays, RefreshCw, ClipboardList } from 'lucide-react';
import api from '../api/client.js';
import useFetch from '../hooks/useFetch.js';
import { formatCurrency, formatDate, formatMonth } from '../utils/format.js';
import Skeleton from '../components/ui/Skeleton.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import { ResidentDetails } from './ResidentAccount.jsx';

export default function ResidentDashboard() {
  const { data, loading, error, reload } = useFetch(async () => (await api.get('/resident/dashboard')).data.data, []);
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <div role="status" aria-label="Loading resident dashboard" className="space-y-4"><Skeleton className="h-44" /><Skeleton className="h-64" /><Skeleton className="h-64" /></div>;
  const { resident, finance, attendance } = data;
  return <div className="space-y-6" aria-busy={loading}>
    <section className="rounded-2xl bg-navy-900 p-6 text-white sm:p-8"><p className="text-sm font-semibold text-teal-300">YOUR RESIDENT SPACE</p><h1 className="mt-3 break-words text-2xl font-extrabold sm:text-3xl">Welcome, {resident.fullName}</h1><p className="mt-3 text-navy-100">Your home at {resident.pgName}.</p></section>
    <div className="grid gap-4 sm:grid-cols-3">{[[Building2, 'Hostel / PG', resident.pgName], [DoorOpen, 'Assigned room', resident.room.roomNumber], [CalendarDays, 'Joined', formatDate(resident.joiningDate)]].map(([Icon, label, value]) => <div key={label} className="card min-w-0 p-5"><Icon className="mb-4 text-teal-700" size={24} /><p className="text-sm text-slate-500">{label}</p><p className="mt-1 break-words text-lg font-bold text-navy-900">{value}</p></div>)}</div>
    <section className="card p-5 sm:p-7" aria-labelledby="resident-rent-heading">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 id="resident-rent-heading" className="text-lg font-bold text-navy-900">Rent and dues</h2><p className="mt-1 text-sm text-slate-500">{formatMonth(finance.month)}</p></div>
        <button type="button" className="btn-secondary" onClick={reload} disabled={loading}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh summary</button></div>
      <dl className="grid gap-5 sm:grid-cols-3">
        <div><dt className="text-sm text-slate-500">Current monthly rent</dt><dd className="mt-1 break-words text-xl font-extrabold text-navy-900">{formatCurrency(finance.monthlyRent)}</dd></div>
        <div><dt className="text-sm text-slate-500">Pending rent dues</dt><dd className="mt-1 break-words text-xl font-extrabold text-orange-600">{formatCurrency(finance.pendingDues)}</dd></div>
        <div><dt className="text-sm text-slate-500">Payment due date</dt><dd className="mt-1 break-words text-lg font-bold text-navy-900">{finance.paymentDueDate ? formatDate(finance.paymentDueDate) : finance.pendingDues > 0 ? 'Not recorded' : 'No pending rent'}</dd></div>
      </dl>
      <div className="mt-5 border-t border-slate-100 pt-4 text-sm text-slate-600">
        {finance.currentBill ? <div className="flex flex-wrap items-center gap-3"><p>This month: {formatCurrency(finance.currentBill.amountDue)} billed · {formatCurrency(finance.currentBill.amountPaid)} paid · {formatCurrency(finance.currentBill.balance)} pending.</p><StatusBadge status={finance.currentBill.status} /></div>
          : <p>No rent bill has been issued for {formatMonth(finance.month)}.</p>}
        <p className="mt-2 text-slate-500">Pending rent dues include all billing months. The payment due date is the earliest unpaid rent due date.</p>
      </div>
    </section>
    <section className="card p-5 sm:p-7" aria-labelledby="resident-attendance-heading"><h2 id="resident-attendance-heading" className="text-lg font-bold text-navy-900">My attendance summary</h2><p className="mb-5 mt-1 text-sm text-slate-500">{formatMonth(attendance.month)} · Through {formatDate(attendance.throughDate)}</p>
      <dl className="grid grid-cols-2 gap-5 sm:grid-cols-4">{[['Present', attendance.Present], ['Absent', attendance.Absent], ['On leave', attendance['On Leave']], ['Recorded days', attendance.recordedDays]].map(([label, count]) => <div key={label}><dt className="text-sm text-slate-500">{label}</dt><dd className="mt-1 text-2xl font-extrabold text-navy-900">{count}</dd></div>)}</dl>
      {attendance.recordedDays === 0 && <p className="mt-5 text-sm text-slate-500">No attendance has been recorded for you this month.</p>}
    </section>
    <section className="card p-5 sm:p-7"><div className="mb-6 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold text-navy-900">Account information</h2><div className="flex flex-wrap gap-4"><Link to="/resident/profile" className="text-sm font-semibold text-teal-700">My Profile</Link><Link to="/resident/change-password" className="text-sm font-semibold text-teal-700">Change password</Link></div></div><ResidentDetails resident={resident} /></section>
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-teal-100 bg-teal-50 p-5"><div><h2 className="font-bold text-teal-900">Need help from your PG owner?</h2><p className="mt-2 text-sm leading-relaxed text-teal-800">Submit a payment verification, room or bed change, leave, maintenance, private or general request.</p></div><Link to="/resident/requests" className="btn-primary"><ClipboardList size={16} />My Requests</Link></section>
  </div>;
}
