const STYLES = {
  Paid: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  Pending: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  'Partially Paid': 'bg-sky-50 text-sky-700 ring-sky-600/20',
  Overdue: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  Occupied: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  Vacant: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  Active: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  Left: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  Present: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  Absent: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  'On Leave': 'bg-amber-50 text-amber-700 ring-amber-600/20',
};

export default function StatusBadge({ status }) {
  if (!status) return null;
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${
        STYLES[status] || 'bg-slate-100 text-slate-600 ring-slate-500/20'
      }`}
    >
      {status}
    </span>
  );
}