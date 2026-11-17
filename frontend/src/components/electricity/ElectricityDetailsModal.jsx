import { Download, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import useFetch from '../../hooks/useFetch.js';
import Modal from '../ui/Modal.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import ErrorState from '../ui/ErrorState.jsx';
import StatusBadge from '../ui/StatusBadge.jsx';
import { formatCurrency, formatDate, formatDateTime, formatMonth } from '../../utils/format.js';
import { downloadPaymentReceipt } from '../../utils/pdf.js';

const Fact = ({ label, value }) => (
  <div className="rounded-xl bg-slate-50 p-3">
    <p className="text-xs font-medium text-slate-500">{label}</p>
    <p className="mt-0.5 truncate font-bold text-slate-900">{value}</p>
  </div>
);

export default function ElectricityDetailsModal({ billId, onClose, onRecordPayment }) {
  const { owner } = useAuth();
  const { data: bill, loading, error, reload } = useFetch(async () => (await api.get(`/electricity/${billId}`)).data.data, [billId]);

  const installments = bill ? [...bill.payments].sort((a, b) => new Date(a.paidOn) - new Date(b.paidOn)) : [];
  const pct = bill && bill.amount ? Math.min(100, (bill.amountPaid / bill.amount) * 100) : 0;

  return (
    <Modal title="Electricity bill details" onClose={onClose}>
      {loading && !bill && (
        <div className="space-y-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-32" />
        </div>
      )}
      {error && !bill && <ErrorState message={error} onRetry={reload} />}

      {bill && (
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-lg font-extrabold text-slate-900">Room {bill.room?.roomNumber || '-'}</p>
              <p className="text-sm text-slate-500">{formatMonth(bill.month)}</p>
            </div>
            <StatusBadge status={bill.status} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Fact label="Billing month" value={formatMonth(bill.month)} />
            <Fact label="Due date" value={formatDate(bill.dueDate)} />
            <Fact label="Previous reading" value={`${bill.previousReading}`} />
            <Fact label="Current reading" value={`${bill.currentReading}`} />
            <Fact label="Units consumed" value={`${bill.units} units`} />
            <Fact label="Rate / unit" value={formatCurrency(bill.ratePerUnit)} />
            <Fact label="Bill amount" value={formatCurrency(bill.amount)} />
            <Fact label="Amount paid" value={formatCurrency(bill.amountPaid)} />
          </div>

          <div>
            <div className="mb-1.5 flex justify-between text-sm">
              <span className="font-medium text-slate-500">Remaining balance</span>
              <span className="font-bold text-slate-900">{formatCurrency(bill.balance)}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>

          <section>
            <h3 className="mb-2 flex items-center gap-2 font-bold text-slate-900"><Zap size={17} /> Installment history</h3>
            {installments.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">No payments recorded yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
                {installments.map((p, i) => (
                  <li key={p._id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800">Installment {i + 1}</p>
                      <p className="truncate text-xs text-slate-500">{formatDateTime(p.paidOn)} · {p.method}{p.note ? ` · ${p.note}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 font-bold text-emerald-600">+{formatCurrency(p.amount)}</span>
                      {p._id && (
                        <button
                          type="button"
                          className="btn-secondary min-h-9 px-2.5"
                          onClick={async () => {
                            try {
                              await downloadPaymentReceipt('Electricity', bill, p, owner);
                            } catch (err) {
                              toast.error(err.message || 'Could not create receipt');
                            }
                          }}
                          aria-label={`Download receipt for installment ${i + 1}`}
                        >
                          <Download size={15} /> Receipt
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-slate-400">Recorded payments are permanent and cannot be edited or deleted.</p>
          </section>

          <div className="flex gap-3">
            <button className="btn-secondary flex-1" onClick={onClose}>Close</button>
            {bill.balance > 0 && (
              <button className="btn-accent flex-1" onClick={() => onRecordPayment(bill)}>Record payment</button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
