import { useNavigate } from 'react-router-dom';
import Modal from '../ui/Modal.jsx';
import ErrorState from '../ui/ErrorState.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import StatusBadge from '../ui/StatusBadge.jsx';
import RequestDetailsModal from '../requests/RequestDetailsModal.jsx';
import { formatCurrency, formatDate, formatDateTime, formatMonth } from '../../utils/format.js';

export default function NotificationDetails({ related, ownerView, onClose, onRetry, onUpdated }) {
  const navigate = useNavigate();
  const { record, target } = related;
  if (target?.kind === 'complaint') return <RequestDetailsModal key={target.id} item={record} ownerView={ownerView} onClose={onClose} onChanged={onUpdated} />;
  const title = related.loading ? 'Opening notification' : target ? ({ room: 'Room change request', leave: 'Leave request details', payment: 'Payment claim details', notice: 'PG notice', bill: 'Bill details' })[target.kind] : 'Related item unavailable';
  return <Modal title={title} onClose={onClose} size="lg">
    {related.loading ? <div role="status" aria-label="Loading related item"><Skeleton className="h-56" /></div> : related.error ? <ErrorState message={related.error} onRetry={onRetry} /> : <div className="space-y-4 break-words [overflow-wrap:anywhere]">
      <div className="flex flex-wrap items-center gap-3">{record.status && <StatusBadge status={record.status} />}{record.createdAt && <span className="text-sm text-slate-500">{formatDateTime(record.createdAt)}</span>}</div>
      {ownerView && record.resident && <p className="font-bold text-navy-900">{record.resident.fullName || record.resident.name}{record.room?.roomNumber ? ` · Room ${record.room.roomNumber}` : typeof record.room === 'string' ? ` · Room ${record.room}` : ''}</p>}
      {target.kind === 'room' && <><h3 className="text-lg font-bold text-navy-900">Room {record.fromRoom.roomNumber} to Room {record.toRoom.roomNumber}</h3><p className="whitespace-pre-wrap text-slate-700">{record.reason}</p>{record.decisionNote && <p className="rounded-xl bg-slate-50 p-3 text-sm">Owner response: {record.decisionNote}</p>}</>}
      {target.kind === 'leave' && <><p className="font-semibold">{formatDate(record.fromDate)} to {formatDate(record.toDate)} · {record.durationDays} day(s)</p><p className="whitespace-pre-wrap text-slate-700">{record.reason}</p>{record.response && <p className="rounded-xl bg-slate-50 p-3 text-sm">Owner response: {record.response}</p>}<h3 className="font-bold text-navy-900">Request history</h3><ul className="space-y-3">{record.history.map((event) => <li key={event.id} className="border-l-2 border-orange-200 pl-3 text-sm"><strong>{event.status}</strong><p className="text-slate-500">{formatDateTime(event.createdAt)} · {event.actor.name}</p>{event.response && <p>{event.response}</p>}</li>)}</ul></>}
      {target.kind === 'notice' && <><h3 className="text-xl font-bold text-navy-900">{record.title}</h3><p className="whitespace-pre-wrap text-slate-700">{record.body}</p>{record.expiresAt && <p className="text-sm text-slate-500">Expires {formatDateTime(record.expiresAt)}</p>}</>}
      {(target.kind === 'payment' || target.kind === 'bill') && <>
        <h3 className="text-lg font-bold text-navy-900">{record.billType === 'Rent' ? 'Personal rent' : 'Shared room electricity'} · {formatMonth(record.month)}</h3>
        {target.kind === 'payment' ? <>
          <p className="text-2xl font-bold text-navy-900">{formatCurrency(record.amount)}</p><p>UTR: {record.utr}</p>
          <p className="text-sm text-slate-500">Payment date: {formatDate(record.paymentDate)}</p>
          {record.reviewNote && <p className="rounded-xl bg-slate-50 p-3 text-sm">Owner response: {record.reviewNote}</p>}
        </> : <dl className="grid grid-cols-2 gap-4 text-sm">
          {[["Billed", formatCurrency(record.amountDue)], ["Paid", formatCurrency(record.amountPaid)], ["Outstanding", formatCurrency(record.balance)], ["Due date", formatDate(record.dueDate)]].map(([label, value]) => <div key={label}><dt className="text-slate-500">{label}</dt><dd className="mt-1 font-bold">{value}</dd></div>)}
        </dl>}
        {record.billType === 'Electricity' && <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">Electricity is a shared room bill. No individual share has been calculated.</p>}
      </>}
      <button type="button" className="btn-primary" onClick={() => { onClose(); navigate(target.path); }}>Open {target.label}</button>
    </div>}
  </Modal>;
}
