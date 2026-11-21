const STYLES = { Low: 'bg-slate-100 text-slate-600', Medium: 'bg-amber-50 text-amber-800', High: 'bg-orange-50 text-orange-800', Urgent: 'bg-rose-50 text-rose-700' };
export default function PriorityBadge({ priority }) {
  return <span className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${STYLES[priority] || STYLES.Medium}`}>{priority} priority</span>;
}
