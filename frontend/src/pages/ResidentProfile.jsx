import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, CalendarCheck, Clock, Download, LogOut, Pencil, Trash2, UserCheck, UserMinus, UserX, Zap } from 'lucide-react';
import api from '../api/client.js';
import useFetch from '../hooks/useFetch.js';
import StatCard from '../components/ui/StatCard.jsx';
import Panel from '../components/ui/Panel.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
import ResidentFormModal from '../components/residents/ResidentFormModal.jsx';
import { currentMonth, formatCurrency, formatDate, formatMonth, getErrorMessage } from '../utils/format.js';
import { useAuth } from '../context/AuthContext.jsx';
import { downloadPaymentReceipt } from '../utils/pdf.js';

const Info = ({ label, children }) => (
  <div className="min-w-0">
    <dt className="text-xs font-medium text-slate-500">{label}</dt>
    <dd className="mt-0.5 truncate font-semibold text-slate-800">{children}</dd>
  </div>
);

const BackLink = () => (
  <Link to="/residents" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-teal-600 hover:text-teal-700">
    <ArrowLeft size={16} /> All residents
  </Link>
);

export default function ResidentProfile() {
  const { owner } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const [month, setMonth] = useState(currentMonth());
  const { data, loading, error, reload } = useFetch(
    async () => (await api.get(`/residents/${id}/profile`, { params: { month } })).data.data,
    [id, month]
  );
  const [editing, setEditing] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (loading && !data) {
    return (
      <div>
        <BackLink />
        <div className="space-y-4">
          <Skeleton className="h-40" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
          </div>
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }
  if (error && !data) {
    return (
      <div>
        <BackLink />
        <ErrorState message={error} onRetry={reload} />
      </div>
    );
  }

  const { resident, rentRecords, rentPending, electricityBills, attendance } = data;
  const active = resident.status === 'Active';
  const payments = rentRecords
    .flatMap((r) => r.payments.map((p) => ({ ...p, month: r.month, rentRecord: r })))
    .sort((a, b) => new Date(b.paidOn) - new Date(a.paidOn));

  const markLeft = async () => {
    setBusy(true);
    try {
      const res = await api.patch(`/residents/${id}/leave`, {});
      toast.success(res.data.message, { duration: 5000 });
      reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
      setLeaveOpen(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const res = await api.delete(`/residents/${id}`);
      toast.success(res.data.message || 'Resident deleted');
      navigate('/residents', { replace: true });
    } catch (err) {
      toast.error(getErrorMessage(err), { duration: 6000 });
      setDeleteOpen(false);
      setBusy(false);
    }
  };

  return (
    <div className={loading ? 'opacity-70 transition' : 'transition'}>
      <BackLink />

      <div className="card mb-5 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-navy-900 text-xl font-bold text-white">
              {resident.fullName.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-extrabold text-slate-900">{resident.fullName}</h1>
              <div className="mt-1 flex items-center gap-2">
                <StatusBadge status={resident.status} />
                <span className="text-sm text-slate-500">Room {resident.room?.roomNumber || '-'}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {active && (
              <>
                <button className="btn-secondary min-h-10" onClick={() => setEditing(true)}><Pencil size={16} /> Edit</button>
                <button className="btn-secondary min-h-10" onClick={() => setLeaveOpen(true)}><LogOut size={16} /> Mark as left</button>
              </>
            )}
            <button className="btn min-h-10 border border-rose-100 bg-white text-rose-600 hover:bg-rose-50" onClick={() => setDeleteOpen(true)}>
              <Trash2 size={16} /> Delete
            </button>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 text-sm sm:grid-cols-3 lg:grid-cols-4">
          <Info label="Phone"><a href={`tel:${resident.phone}`} className="text-teal-600">{resident.phone}</a></Info>
          <Info label="Email">{resident.email || '-'}</Info>
          <Info label="Monthly rent">{formatCurrency(resident.monthlyRent)}</Info>
          <Info label="Joined">{formatDate(resident.joiningDate)}</Info>
          {resident.status === 'Left' && <Info label="Left on">{formatDate(resident.leftDate)}</Info>}
          <Info label="Emergency contact">
            {resident.emergencyContact?.name || resident.emergencyContact?.phone
              ? [resident.emergencyContact.name, resident.emergencyContact.phone].filter(Boolean).join(' · ')
              : '-'}
          </Info>
        </dl>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Clock} label="Rent pending (all months)" value={formatCurrency(rentPending)} tone="orange" />
        <StatCard icon={UserCheck} label={`Present · ${formatMonth(attendance.month)}`} value={attendance.summary.Present} tone="emerald" />
        <StatCard icon={UserX} label="Absent" value={attendance.summary.Absent} tone="rose" />
        <StatCard icon={UserMinus} label="On leave" value={attendance.summary['On Leave']} tone="navy" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Rent records">
          {rentRecords.length === 0 ? (
            <EmptyState title="No rent records yet" text="Rent records appear once monthly rent is generated." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {rentRecords.map((r) => (
                <li key={r._id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800">{formatMonth(r.month)}</p>
                    <p className="truncate text-xs text-slate-500">
                      Due {formatCurrency(r.amountDue)} · Paid {formatCurrency(r.amountPaid)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-bold text-slate-900">{r.balance > 0 ? `${formatCurrency(r.balance)} left` : 'Settled'}</span>
                    <StatusBadge status={r.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Payment history">
          {payments.length === 0 ? (
            <EmptyState title="No payments yet" text="Rent payments recorded for this resident appear here." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {payments.map((p) => (
                <li key={p._id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800">{formatDate(p.paidOn)}</p>
                    <p className="truncate text-xs text-slate-500">{p.method} · Rent for {formatMonth(p.month)}{p.note ? ` · ${p.note}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 font-bold text-emerald-600">+{formatCurrency(p.amount)}</span>
                    {p._id && (
                      <button
                        className="btn-secondary min-h-9 px-2.5"
                        onClick={async () => {
                          try {
                            await downloadPaymentReceipt('Rent', p.rentRecord, p, owner);
                          } catch (error) {
                            toast.error(error.message || 'Could not create receipt');
                          }
                        }}
                      >
                        <Download size={15} /> Receipt
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Electricity (shared by the room)">
          {electricityBills.length === 0 ? (
            <EmptyState icon={Zap} title="No electricity bills" text="Bills for this resident's room appear here." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {electricityBills.map((b) => (
                <li key={b._id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800">{formatMonth(b.month)}</p>
                    <p className="truncate text-xs text-slate-500">{b.units} units × {formatCurrency(b.ratePerUnit)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-bold text-slate-900">{formatCurrency(b.amount)}</span>
                    <StatusBadge status={b.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <section className="card min-w-0 p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-bold text-slate-900">Attendance</h2>
            <input
              type="month"
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
              className="input w-auto"
              aria-label="Attendance month"
            />
          </div>
          {attendance.records.length === 0 ? (
            <EmptyState icon={CalendarCheck} title="No attendance marked" text={`Nothing recorded for ${formatMonth(attendance.month)}.`} />
          ) : (
            <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
              {attendance.records.map((a) => (
                <li key={a._id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800">{formatDate(a.date)}</p>
                    {a.note && <p className="truncate text-xs text-slate-500">{a.note}</p>}
                  </div>
                  <StatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {editing && (
        <ResidentFormModal
          resident={resident}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            reload();
          }}
        />
      )}

      {leaveOpen && (
        <ConfirmDialog
          title={`Mark ${resident.fullName} as left?`}
          message="They will no longer count as an active resident. Their rent, payment and attendance history is kept, and any unpaid rent stays on record."
          confirmText="Mark as left"
          tone="warning"
          loading={busy}
          onConfirm={markLeft}
          onCancel={() => setLeaveOpen(false)}
        />
      )}

      {deleteOpen && (
        <ConfirmDialog
          title={`Delete ${resident.fullName}?`}
          message="Permanent deletion only works for residents with no rent or attendance history (for example, someone added by mistake). Otherwise, use Mark as left."
          confirmText="Delete permanently"
          loading={busy}
          onConfirm={remove}
          onCancel={() => setDeleteOpen(false)}
        />
      )}
    </div>
  );
}