import { Link } from 'react-router-dom';
import { IndianRupee } from 'lucide-react';
import api from '../../api/client.js';
import useFetch from '../../hooks/useFetch.js';
import Modal from '../ui/Modal.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import ErrorState from '../ui/ErrorState.jsx';
import StatusBadge from '../ui/StatusBadge.jsx';
import { formatCurrency, formatDate, formatDateTime, formatMonth } from '../../utils/format.js';

const Fact = ({ label, value }) => (
  <div className="rounded-xl bg-slate-50 p-3">
    <p className="text-xs font-medium text-slate-500">{label}</p>
    <p className="mt-0.5 truncate font-bold text-slate-900">{value}</p>
  </div>
);

// Loads the record from GET /rent/:id. onRecordPayment(record) opens the payment form.
export default function RentDetailsModal({ recordId, onClose, onRecordPayment }) {
  const { data: r, loading, error, reload } = useFetch(async () => (await api.get(`/rent/${recordId}`)).data.data, [recordId]);

  const installments = r ? [...r.payments].sort((a, b) => new Date(a.paidOn) - new Date(b.paidOn)) : [];
  const pct = r && r.amountDue ? Math.min(100, (r.amountPaid / r.amountDue) * 100) : 0;

  return (
    <Modal title="Rent details" onClose={onClose}>
      {loading && !r && (
        <div className="space-y-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-32" />
        </div>
      )}
      {error && !r && <ErrorState message={error} onRetry={reload} />}

      {r && (
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link to={`/residents/${r.resident?._id}`} className="block truncate text-lg font-extrabold text-slate-900 hover:text-teal-700">
                {r.resident?.fullName}
              </Link>
              <p className="text-sm text-slate-500">
                Room {r.room?.roomNumber || '-'} · {r.resident?.phone} {r.resident?.status === 'Left' && '· Left'}
              </p>
            </div>
            <StatusBadge status={r.status} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Fact label="Rent month" value={formatMonth(r.month)} />
            <Fact label="Due date" value={formatDate(r.dueDate)} />
            <Fact label="Monthly rent" value={formatCurrency(r.amountDue)} />
            <Fact label="Total paid" value={formatCurrency(r.amountPaid)} />
          </div>

          <div>
            <div className="mb-1.5 flex justify-between text-sm">
              <span className="font-medium text-slate-500">Remaining balance</span>
              <span className="font-bold text-slate-900">{formatCurrency(r.balance)}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>

          <section>
            <h3 className="mb-2 flex items-center gap-2 font-bold text-slate-900"><IndianRupee size={17} /> Installment history</h3>
            {installments.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">No payments recorded yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
                {installments.map((p, i) => (
                  <li key={p._id} className="flex items-center justify-between gap-3 px-3 py-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800">Installment {i + 1}</p>
                      <p className="truncate text-xs text-slate-500">{formatDateTime(p.paidOn)} · {p.method}{p.note ? ` · ${p.note}` : ''}</p>
                    </div>
                    <span className="shrink-0 font-bold text-emerald-600">+{formatCurrency(p.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-slate-400">Recorded payments are permanent and cannot be edited or deleted.</p>
          </section>

          <div className="flex gap-3">
            <button className="btn-secondary flex-1" onClick={onClose}>Close</button>
            {r.balance > 0 && (
              <button className="btn-accent flex-1" onClick={() => onRecordPayment(r)}>Record payment</button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}