import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, Clock, Eye, FilePlus, SearchX, Wallet, Zap } from 'lucide-react';
import api from '../api/client.js';
import useFetch from '../hooks/useFetch.js';
import PageHeader from '../components/ui/PageHeader.jsx';
import StatCard from '../components/ui/StatCard.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import SearchInput from '../components/ui/SearchInput.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
import Modal from '../components/ui/Modal.jsx';
import MonthYearPicker from '../components/ui/MonthYearPicker.jsx';
import { Field, Input, Select } from '../components/ui/FormControls.jsx';
import ElectricityDetailsModal from '../components/electricity/ElectricityDetailsModal.jsx';
import RecordElectricityPaymentModal from '../components/electricity/RecordElectricityPaymentModal.jsx';
import { PAYMENT_STATUSES } from '../utils/constants.js';
import { currentMonth, formatCurrency, formatMonth, getErrorMessage, round2 } from '../utils/format.js';

const byRoomNumber = (a, b) => (a.room?.roomNumber || '').localeCompare(b.room?.roomNumber || '', undefined, { numeric: true });

const numberOrZero = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

export default function Electricity() {
  const [month, setMonth] = useState(currentMonth());
  const [search, setSearch] = useState('');
  const [roomFilter, setRoomFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [generateOpen, setGenerateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ room: '', month: currentMonth(), previousReading: '', currentReading: '', ratePerUnit: '' });
  const [errors, setErrors] = useState({});
  const [prefill, setPrefill] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [billCreated, setBillCreated] = useState(null);
  const [detailsId, setDetailsId] = useState(null);
  const [payBill, setPayBill] = useState(null);

  const { data: rooms } = useFetch(async () => (await api.get('/rooms')).data.data, []);
  const { data, loading, error, reload } = useFetch(
    async () => ({ ...(await api.get('/electricity', { params: { month } })).data, month }),
    [month]
  );

  const ready = data && data.month === month;
  const records = ready ? data.data : [];
  const overdue = records.filter((b) => b.status === 'Overdue');
  const overdueAmount = round2(overdue.reduce((sum, b) => sum + b.balance, 0));

  const term = search.trim().toLowerCase();
  const shown = useMemo(
    () =>
      records
        .filter((b) => (b.room?.roomNumber || '').toLowerCase().includes(term))
        .filter((b) => !roomFilter || b.room?._id === roomFilter)
        .filter((b) => !statusFilter || b.status === statusFilter)
        .sort(byRoomNumber),
    [records, roomFilter, statusFilter, term]
  );

  const filtersActive = Boolean(term) || Boolean(roomFilter) || Boolean(statusFilter);
  const clearFilters = () => {
    setSearch('');
    setRoomFilter('');
    setStatusFilter('');
  };

  const openBillForm = () => {
    setForm({ room: '', month: currentMonth(), previousReading: '', currentReading: '', ratePerUnit: '' });
    setErrors({});
    setPrefill(null);
    setConfirming(false);
    setGenerateOpen(true);
  };

  const handleRoomChange = async (roomId) => {
    setForm((s) => ({ ...s, room: roomId }));

    if (!roomId) {
      setPrefill(null);
      setForm((s) => ({ ...s, previousReading: '', currentReading: '', ratePerUnit: '' }));
      return;
    }

    try {
      const { data: payload } = await api.get(`/electricity/prefill/${roomId}`);
      const d = payload.data;
      setPrefill(d);
      setForm((s) => ({
        ...s,
        previousReading: String(d.previousReading ?? ''),
        ratePerUnit: String(d.ratePerUnit ?? ''),
        currentReading: s.currentReading || String(d.previousReading ?? ''),
      }));
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const previewUnits = Math.max(0, numberOrZero(form.currentReading) - numberOrZero(form.previousReading));
  const previewTotal = round2(previewUnits * numberOrZero(form.ratePerUnit));

  const validateBill = () => {
    const nextErrors = {};
    if (!form.room) nextErrors.room = 'Select a room';
    if (!form.month) nextErrors.month = 'Choose the billing month';
    if (form.previousReading === '' || Number.isNaN(Number(form.previousReading))) nextErrors.previousReading = 'Enter the previous reading';
    else if (Number(form.previousReading) < 0) nextErrors.previousReading = 'Previous reading cannot be negative';
    if (form.currentReading === '' || Number.isNaN(Number(form.currentReading))) nextErrors.currentReading = 'Enter the current reading';
    else if (Number(form.currentReading) < 0) nextErrors.currentReading = 'Current reading cannot be negative';
    else if (Number(form.currentReading) < Number(form.previousReading)) nextErrors.currentReading = 'Current reading cannot be less than the previous reading';
    if (form.ratePerUnit === '' || Number.isNaN(Number(form.ratePerUnit))) nextErrors.ratePerUnit = 'Enter the rate per unit';
    else if (Number(form.ratePerUnit) < 0) nextErrors.ratePerUnit = 'Rate cannot be negative';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const reviewBill = (ev) => {
    ev.preventDefault();
    if (validateBill()) setConfirming(true);
  };

  const submitBill = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const payload = {
        room: form.room,
        month: form.month,
        previousReading: numberOrZero(form.previousReading),
        currentReading: numberOrZero(form.currentReading),
        ratePerUnit: numberOrZero(form.ratePerUnit),
      };
      const response = await api.post('/electricity', payload);
      setBillCreated(response.data.data);
      setGenerateOpen(false);
      setForm({ room: '', month: currentMonth(), previousReading: '', currentReading: '', ratePerUnit: '' });
      setConfirming(false);
      setPrefill(null);
      reload();
      toast.success(response.data.message || 'Electricity bill created');
    } catch (err) {
      toast.error(getErrorMessage(err));
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  };

  const paymentSaved = () => {
    setPayBill(null);
    setDetailsId(null);
    reload();
  };

  return (
    <div>
      <PageHeader title="Electricity Bills" subtitle={formatMonth(month)}>
        <MonthYearPicker value={month} onChange={setMonth} />
        <button className="btn-accent" onClick={openBillForm}>
          <FilePlus size={18} /> Generate bill
        </button>
      </PageHeader>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Wallet} label="Electricity billed" value={formatCurrency(data?.totals?.billed)} tone="navy" loading={!ready} />
        <StatCard icon={CheckCircle2} label="Collected" value={formatCurrency(data?.totals?.paid)} tone="emerald" loading={!ready} />
        <StatCard icon={Clock} label="Outstanding" value={formatCurrency(data?.totals?.balance)} tone="orange" loading={!ready} />
        <StatCard
          icon={AlertTriangle}
          label="Overdue"
          value={formatCurrency(overdueAmount)}
          sub={`${overdue.length} record${overdue.length === 1 ? '' : 's'}`}
          tone="rose"
          loading={!ready}
        />
      </div>

      <div className="mb-4 space-y-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by room number" />
        <div className="grid grid-cols-2 gap-3 md:flex md:items-center">
          <Select value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)} aria-label="Filter by room" className="md:w-48">
            <option value="">All rooms</option>
            {(rooms || []).map((r) => <option key={r._id} value={r._id}>Room {r.roomNumber}</option>)}
          </Select>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status" className="md:w-48">
            <option value="">All statuses</option>
            {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          {filtersActive && <button className="btn-secondary col-span-2 md:col-span-1" onClick={clearFilters}>Clear filters</button>}
        </div>
      </div>

      {!ready && !error ? (
        <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : error && !ready ? (
        <ErrorState message={error} onRetry={reload} />
      ) : records.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Zap}
            title={`No electricity bills for ${formatMonth(month)}`}
            text="Generate a monthly bill for a room to track readings and payments."
            action={<button className="btn-accent" onClick={openBillForm}><FilePlus size={18} /> Generate bill</button>}
          />
        </div>
      ) : shown.length === 0 ? (
        <div className="card">
          <EmptyState icon={SearchX} title="No bills match" text="Try a different room or status." action={<button className="btn-secondary" onClick={clearFilters}>Clear filters</button>} />
        </div>
      ) : (
        <div className={loading ? 'opacity-70 transition' : 'transition'}>
          <div className="card hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Room</th>
                    <th className="px-4 py-3 font-semibold">Billing month</th>
                    <th className="px-4 py-3 text-right font-semibold">Bill</th>
                    <th className="px-4 py-3 text-right font-semibold">Paid</th>
                    <th className="px-4 py-3 text-right font-semibold">Balance</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shown.map((b) => (
                    <tr key={b._id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <button onClick={() => setDetailsId(b._id)} className="text-left font-semibold text-slate-900 hover:text-teal-700">
                          Room {b.room?.roomNumber || '-'}
                        </button>
                        <p className="text-xs text-slate-500">{b.previousReading} → {b.currentReading} · {b.units} units</p>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{formatMonth(b.month)}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{formatCurrency(b.amount)}</td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-600">{formatCurrency(b.amountPaid)}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">{formatCurrency(b.balance)}</td>
                      <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button className="btn-secondary min-h-10" onClick={() => setDetailsId(b._id)}><Eye size={16} /> Details</button>
                          <button className="btn-accent min-h-10" disabled={b.balance <= 0} onClick={() => setPayBill(b)}>Record payment</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <ul className="space-y-3 md:hidden">
            {shown.map((b) => (
              <li key={b._id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <button onClick={() => setDetailsId(b._id)} className="min-w-0 text-left">
                    <p className="truncate font-semibold text-slate-900">Room {b.room?.roomNumber || '-'}</p>
                    <p className="text-xs text-slate-500">{formatMonth(b.month)}</p>
                  </button>
                  <StatusBadge status={b.status} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-xl bg-slate-50 py-2"><p className="text-sm font-bold text-slate-800">{formatCurrency(b.amount)}</p>Bill</div>
                  <div className="rounded-xl bg-emerald-50 py-2"><p className="text-sm font-bold text-emerald-700">{formatCurrency(b.amountPaid)}</p>Paid</div>
                  <div className="rounded-xl bg-orange-50 py-2"><p className="text-sm font-bold text-orange-700">{formatCurrency(b.balance)}</p>Balance</div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button className="btn-secondary min-h-10 flex-1" onClick={() => setDetailsId(b._id)}><Eye size={16} /> Details</button>
                  <button className="btn-accent min-h-10 flex-1" disabled={b.balance <= 0} onClick={() => setPayBill(b)}>
                    {b.balance <= 0 ? 'Paid' : 'Record payment'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {generateOpen && (
        <Modal title="Generate electricity bill" onClose={() => setGenerateOpen(false)} size="md">
          <form onSubmit={reviewBill} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Room" htmlFor="room" error={errors.room} required>
                <Select id="room" value={form.room} onChange={(e) => handleRoomChange(e.target.value)} invalid={!!errors.room}>
                  <option value="">Select room</option>
                  {(rooms || []).map((r) => <option key={r._id} value={r._id}>Room {r.roomNumber}</option>)}
                </Select>
              </Field>

              <Field label="Billing month" htmlFor="month" error={errors.month} required>
                <Input id="month" name="month" type="month" value={form.month} onChange={(e) => setForm((s) => ({ ...s, month: e.target.value }))} invalid={!!errors.month} />
              </Field>
            </div>

            {prefill && (
              <div className="rounded-xl border border-teal-100 bg-teal-50/60 p-3 text-sm text-teal-800">
                <p className="font-semibold">Suggested meter history</p>
                <p className="mt-1">Previous reading: {prefill.previousReading} · Last recorded bill: {prefill.lastBillMonth ? formatMonth(prefill.lastBillMonth) : 'Room start'} · Default rate: {formatCurrency(prefill.ratePerUnit)} per unit</p>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Previous reading" htmlFor="previousReading" error={errors.previousReading} required>
                <Input
                  id="previousReading"
                  name="previousReading"
                  type="number"
                  min="0"
                  step="1"
                  value={form.previousReading}
                  onChange={(e) => setForm((s) => ({ ...s, previousReading: e.target.value }))}
                  invalid={!!errors.previousReading}
                />
              </Field>

              <Field label="Current reading" htmlFor="currentReading" error={errors.currentReading} required>
                <Input
                  id="currentReading"
                  name="currentReading"
                  type="number"
                  min="0"
                  step="1"
                  value={form.currentReading}
                  onChange={(e) => setForm((s) => ({ ...s, currentReading: e.target.value }))}
                  invalid={!!errors.currentReading}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Rate per unit (₹)" htmlFor="ratePerUnit" error={errors.ratePerUnit} required>
                <Input
                  id="ratePerUnit"
                  name="ratePerUnit"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.ratePerUnit}
                  onChange={(e) => setForm((s) => ({ ...s, ratePerUnit: e.target.value }))}
                  invalid={!!errors.ratePerUnit}
                />
              </Field>

              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-500">Live preview</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{previewUnits} units × {formatCurrency(form.ratePerUnit || 0)} = {formatCurrency(previewTotal)}</p>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button type="button" className="btn-secondary flex-1" onClick={() => setGenerateOpen(false)}>Cancel</button>
              <button type="submit" className="btn-accent flex-1">Review bill</button>
            </div>
          </form>
        </Modal>
      )}

      {confirming && (
        <ConfirmDialog
          title="Save this electricity bill?"
          message={`Room ${rooms?.find((r) => r._id === form.room)?.roomNumber || '-'} for ${formatMonth(form.month)}: ${previewUnits} units × ${formatCurrency(form.ratePerUnit)} = ${formatCurrency(previewTotal)}. This creates a billing record and keeps historical reading data intact.`}
          confirmText={saving ? 'Saving...' : 'Save bill'}
          tone="warning"
          loading={saving}
          onConfirm={submitBill}
          onCancel={() => setConfirming(false)}
        />
      )}

      {billCreated && (
        <Modal title="Bill created" onClose={() => setBillCreated(null)} size="sm">
          <div className="rounded-xl bg-emerald-50 p-4">
            <p className="text-2xl font-extrabold text-emerald-700">{formatCurrency(billCreated.amount)}</p>
            <p className="text-sm text-slate-600">Room {billCreated.room?.roomNumber} · {formatMonth(billCreated.month)}</p>
          </div>
          <p className="mt-3 text-sm text-slate-500">{billCreated.units} units at {formatCurrency(billCreated.ratePerUnit)} per unit. The reading history was kept intact and no overwriting occurred.</p>
          <button className="btn-primary mt-4 w-full" onClick={() => setBillCreated(null)}>OK</button>
        </Modal>
      )}

      {detailsId && (
        <ElectricityDetailsModal
          billId={detailsId}
          onClose={() => setDetailsId(null)}
          onRecordPayment={(bill) => {
            setDetailsId(null);
            setPayBill(bill);
          }}
        />
      )}

      {payBill && <RecordElectricityPaymentModal bill={payBill} onClose={() => setPayBill(null)} onSaved={paymentSaved} />}
    </div>
  );
}
