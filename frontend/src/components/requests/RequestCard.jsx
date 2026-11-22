import { Eye } from 'lucide-react';
import StatusBadge from '../ui/StatusBadge.jsx';
import { formatDateTime } from '../../utils/format.js';

export default function RequestCard({ request, ownerView, onOpen }) {
  return <article className="card min-w-0 space-y-3 p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide text-teal-700">{request.category}{request.priority && ` · ${request.priority}`}</p>
        <h2 className="mt-1 break-words text-lg font-bold text-navy-900">{request.title}</h2>
        {ownerView && <p className="mt-1 break-words text-sm font-semibold text-slate-700">{request.resident.name} · Room {request.room.number || '—'}{request.room.bedNumber ? ` · Bed ${request.room.bedNumber}` : ''}</p>}
      </div>
      <StatusBadge status={request.status} />
    </div>
    <p className="whitespace-pre-wrap break-words text-sm text-slate-600">{request.description}</p>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
      <p className="text-xs text-slate-500">Submitted {formatDateTime(request.createdAt)}</p>
      <button type="button" className="btn-secondary min-h-9" onClick={onOpen}><Eye size={15} /> Details</button>
    </div>
    {request.ownerResponse && <p className="whitespace-pre-wrap break-words rounded-lg bg-teal-50 p-3 text-sm text-teal-900">Owner response: {request.ownerResponse}</p>}
  </article>;
}
