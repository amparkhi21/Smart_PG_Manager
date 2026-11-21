import { Link } from 'react-router-dom';
import api from '../api/client.js';
import useFetch from '../hooks/useFetch.js';
import { formatCurrency, formatDate, formatDateTime } from '../utils/format.js';
import PageHeader from '../components/ui/PageHeader.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';

export function ResidentDetails({ resident }) {
  const fields = [
    ['Full name', resident.fullName], ['Phone number', resident.phone], ['Email address', resident.email || 'Not provided'],
    ['Hostel / PG', resident.pgName], ['PG code', resident.pgCode], ['Assigned room', resident.room.roomNumber],
    ['Joining date', formatDate(resident.joiningDate)], ['Account status', resident.accountStatus === 'active' ? 'Active' : 'Disabled'],
    ['First login', resident.firstLoginAt ? formatDateTime(resident.firstLoginAt) : 'Not recorded'],
    ['Last successful login', resident.lastLoginAt ? formatDateTime(resident.lastLoginAt) : 'Not recorded'],
    ...(resident.monthlyRent !== undefined ? [['Monthly rent', formatCurrency(resident.monthlyRent)]] : []),
  ];
  return <dl className="grid gap-6 sm:grid-cols-2">{fields.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-sm text-slate-500">{label}</dt><dd className="mt-1 break-words font-semibold text-navy-900">{value}</dd></div>)}</dl>;
}

export default function ResidentAccount() {
  const { data, loading, error, reload } = useFetch(async () => (await api.get('/resident/profile')).data.data, []);
  return <div><PageHeader title="My Profile" subtitle="Your information, as maintained by your PG owner.">
    <Link to="/resident/change-password" className="btn-secondary">Change password</Link>
  </PageHeader>
    {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <div role="status" aria-label="Loading profile"><Skeleton className="h-80" /></div>
      : <section className="card p-5 sm:p-7"><ResidentDetails resident={data.resident} /><p className="mt-6 border-t border-slate-100 pt-5 text-sm text-slate-500">Contact your owner to update your personal information or room assignment.</p></section>}
  </div>;
}
