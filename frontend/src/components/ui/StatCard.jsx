import Skeleton from './Skeleton.jsx';

const TONES = {
  navy: 'bg-navy-50 text-navy-700',
  teal: 'bg-teal-50 text-teal-600',
  orange: 'bg-orange-50 text-orange-600',
  rose: 'bg-rose-50 text-rose-600',
  emerald: 'bg-emerald-50 text-emerald-600',
};

export default function StatCard({ icon: Icon, label, value, sub, tone = 'navy', loading }) {
  return (
    <div className="card min-w-0 p-4">
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${TONES[tone]}`}>
        <Icon size={20} />
      </div>
      {loading ? (
        <>
          <Skeleton className="mb-2 h-7 w-20" />
          <Skeleton className="h-4 w-24" />
        </>
      ) : (
        <>
          <p className="truncate text-2xl font-bold tracking-tight text-slate-900">{value}</p>
          <p className="truncate text-sm font-medium text-slate-500">{label}</p>
          {sub && <p className="mt-1 truncate text-xs text-slate-400">{sub}</p>}
        </>
      )}
    </div>
  );
}