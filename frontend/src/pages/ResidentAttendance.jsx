import { useState } from 'react';
import { CalendarCheck, CheckCircle, ChevronLeft, ChevronRight, Percent, XCircle } from 'lucide-react';
import api from '../api/client.js';
import useFetch from '../hooks/useFetch.js';
import { useAuth } from '../context/AuthContext.jsx';
import { currentMonth, formatDate, formatMonth, toDateInput } from '../utils/format.js';
import PageHeader from '../components/ui/PageHeader.jsx';
import StatCard from '../components/ui/StatCard.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { Field, Input } from '../components/ui/FormControls.jsx';

const moveMonth = (month, delta) => {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number - 1 + delta, 1)).toISOString().slice(0, 7);
};

export default function ResidentAttendance() {
  const { resident } = useAuth();
  const latestMonth = currentMonth(), firstMonth = toDateInput(resident.joiningDate).slice(0, 7);
  const [month, setMonth] = useState(latestMonth);
  const { data, loading, error, reload } = useFetch(async () => (await api.get('/resident/attendance', { params: { month } })).data.data, [month]);
  const summary = data?.summary;
  return <div>
    <PageHeader title="My Attendance" subtitle={`Your attendance since joining on ${formatDate(resident.joiningDate)}.`} />
    <div className="mb-6 flex flex-wrap items-end gap-3">
      <button type="button" className="btn-secondary" aria-label="Previous month" disabled={month <= firstMonth} onClick={() => setMonth(moveMonth(month, -1))}><ChevronLeft size={18} /></button>
      <Field label="Attendance month" htmlFor="attendance-month"><Input id="attendance-month" type="month" value={month} min={firstMonth} max={latestMonth} onChange={(event) => { const value = event.target.value; if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value) && value >= firstMonth && value <= latestMonth) setMonth(value); }} /></Field>
      <button type="button" className="btn-secondary" aria-label="Next month" disabled={month >= latestMonth} onClick={() => setMonth(moveMonth(month, 1))}><ChevronRight size={18} /></button>
    </div>
    {error ? <ErrorState message={error} onRetry={reload} /> : loading || !data ? <div role="status" aria-label="Loading attendance"><Skeleton className="h-64" /></div> : <>
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard icon={CheckCircle} label="Present" value={summary.Present} tone="teal" />
        <StatCard icon={XCircle} label="Absent" value={summary.Absent} tone="rose" />
        <StatCard icon={Percent} label="Attendance percentage" value={summary.percentage === null ? '—' : `${summary.percentage}%`} tone="orange" />
      </div>
      <p className="mb-5 text-sm text-slate-500">{summary.recordedDays} recorded Present/Absent {summary.recordedDays === 1 ? 'day' : 'days'} in {formatMonth(month)}. Unrecorded dates and On Leave entries are excluded from the percentage.</p>
      {!data.records.length ? <div className="card"><EmptyState icon={CalendarCheck} title="No attendance recorded" text="Your owner has not recorded attendance for this month since your joining date. Unrecorded days are not counted as absent." /></div>
        : <section className="card overflow-hidden" aria-label="Your attendance records"><h2 className="border-b border-slate-100 px-5 py-4 font-bold text-navy-900">{formatMonth(month)}</h2><ul className="divide-y divide-slate-100">{data.records.map((record) => <li key={record.date} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div><time dateTime={record.date} className="font-semibold text-slate-800">{formatDate(`${record.date}T00:00:00+05:30`)}</time>{record.note && <p className="mt-1 break-words text-sm text-slate-500">{record.note}</p>}</div>
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${record.status === 'Present' ? 'bg-teal-50 text-teal-700' : record.status === 'Absent' ? 'bg-rose-50 text-rose-700' : 'bg-orange-50 text-orange-700'}`}>{record.status}</span>
        </li>)}</ul></section>}
    </>}
  </div>;
}
