import { useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, Clock, Eye, FilePlus, IndianRupee, SearchX, Wallet } from 'lucide-react';
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
import { Select } from '../components/ui/FormControls.jsx';
import RecordPaymentModal from '../components/rent/RecordPaymentModal.jsx';
import RentDetailsModal from '../components/rent/RentDetailsModal.jsx';
import { PAYMENT_STATUSES } from '../utils/constants.js';
import { currentMonth, formatCurrency, formatMonth, getErrorMessage, round2 } from '../utils/format.js';

const byRoomThenName = (a, b) =>
  (a.room?.roomNumber || '').localeCompare(b.room?.roomNumber || '', undefined, { numeric: true }) ||
  (a.resident?.fullName || '').localeCompare(b.resident?.fullName || '');

export default function Rent() {
  const [month, setMonth] = useState(currentMonth());
  const [search, setSearch] = useState('');
  const [roomFilter, setRoomFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [detailsId, setDetailsId] = useState(null);
  const [payRecord, setPayRecord] = useState(null);

  const { data: rooms } = useFetch(async () => (await api.get('/rooms')).data.data, []);
  // All records for the month; totals come from the backend. Filters below only narrow the list.
  const { data, loading, error, reload } = useFetch(
    async () => ({ ...(await api.get('/rent', { params: { month } })).data, month }),
    [month]
  );

  const ready = data && data.month === month;
  const records = ready ? data.data : [];
  const overdue = records.filter((r) => r.status === 'Overdue');
  const overdueAmount = round2(overdue.reduce((s, r) => s + r.balance, 0));

  const term = search.trim().toLowerCase();
  const shown = records
    .filter((r) => (r.resident?.fullName || '').toLowerCase().includes(term))
    .filter((r) => !roomFilter || r.room?._id === roomFilter)
    .filter((r) => !statusFilter || r.status === statusFilter)
    .sort(byRoomThenName);
  const filtersActive = Boolean(term) || Boolean(roomFilter) || Boolean(statusFilter);
  const clearFilters = () => {
    setSearch('');
    setRoomFilter('');
    setStatusFilter('');
  };

  const generate = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const res = await api.post('/rent/generate', { month });
      setResult(res.data.data);
      reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setGenerating(false);
      setGenerateOpen(false);
    }
  };

  const paymentSaved = () => {
    setPayRecord(null);
    setDetailsId(null);
    reload();
  };

  const GenerateButton = ({ className = 'btn-accent' }) => (
    <button className={className} onClick={() => setGenerateOpen(true)}>
      <FilePlus size={18} /> Generate monthly rent
    </button>
  );

  return (
    <div>
      <PageHeader title="Rent Management" subtitle={formatMonth(month)}>
        <MonthYearPicker value={month} onChange={setMonth} />
        <GenerateButton />
      </PageHeader>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Wallet} label="Rent billed" value={formatCurrency(data?.totals?.due)} tone="navy" loading={!ready} />
        <StatCard icon={CheckCircle2} label="Rent collected" value={formatCurrency(data?.totals?.paid)} tone="emerald" loading={!ready} />
        <StatCard icon={Clock} label="Rent pending" value={formatCurrency(data?.totals?.balance)} tone="orange" loading={!ready} />
        <StatCard
          icon={AlertTriangle}
          label="Overdue rent"
          value={formatCurrency(overdueAmount)}
          sub={`${overdue.length} record${overdue.length === 1 ? '' : 's'}`}
          tone="rose"
          loading={!ready}
        />
      </div>

      <div className="mb-4 space-y-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by resident name" />
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
            icon={IndianRupee}
            title={`No rent records for ${formatMonth(month)}`}
            text="Generate monthly rent to create a record for each active resident."
            action={<GenerateButton />}
          />
        </div>
      ) : shown.length === 0 ? (
        <div className="card">
          <EmptyState icon={SearchX} title="No records match" text="Try a different name, room or status." action={<button className="btn-secondary" onClick={clearFilters}>Clear filters</button>} />
        </div>
      ) : (
        <div className={loading ? 'opacity-70 transition' : 'transition'}>
          {/* Desktop table */}
          <div className="card hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Resident</th>
                    <th className="px-4 py-3 font-semibold">Room</th>
                    <th className="px-4 py-3 text-right font-semibold">Rent</th>
                    <th className="px-4 py-3 text-right font-semibold">Paid</th>
                    <th className="px-4 py-3 text-right font-semibold">Balance</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shown.map((r) => (
                    <tr key={r._id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <button onClick={() => setDetailsId(r._id)} className="text-left font-semibold text-slate-900 hover:text-teal-700">
                          {r.resident?.fullName}
                        </button>
                        {r.resident?.status === 'Left' && <span className="ml-2 text-xs text-slate-400">Left</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{r.room?.roomNumber || '-'}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{formatCurrency(r.amountDue)}</td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-600">{formatCurrency(r.amountPaid)}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">{formatCurrency(r.balance)}</td>
                      <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button className="btn-secondary min-h-10" onClick={() => setDetailsId(r._id)}><Eye size={16} /> Details</button>
                          <button className="btn-accent min-h-10" disabled={r.balance <= 0} onClick={() => setPayRecord(r)}>Record payment</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {shown.map((r) => (
              <li key={r._id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <button onClick={() => setDetailsId(r._id)} className="min-w-0 text-left">
                    <p className="truncate font-semibold text-slate-900">{r.resident?.fullName}</p>
                    <p className="text-xs text-slate-500">Room {r.room?.roomNumber || '-'}{r.resident?.status === 'Left' && ' · Left'}</p>
                  </button>
                  <StatusBadge status={r.status} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-xl bg-slate-50 py-2"><p className="text-sm font-bold text-slate-800">{formatCurrency(r.amountDue)}</p>Rent</div>
                  <div className="rounded-xl bg-emerald-50 py-2"><p className="text-sm font-bold text-emerald-700">{formatCurrency(r.amountPaid)}</p>Paid</div>
                  <div className="rounded-xl bg-orange-50 py-2"><p className="text-sm font-bold text-orange-700">{formatCurrency(r.balance)}</p>Balance</div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button className="btn-secondary min-h-10 flex-1" onClick={() => setDetailsId(r._id)}><Eye size={16} /> Details</button>
                  <button className="btn-accent min-h-10 flex-1" disabled={r.balance <= 0} onClick={() => setPayRecord(r)}>
                    {r.balance <= 0 ? 'Paid' : 'Record payment'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {generateOpen && (
        <ConfirmDialog
          title={`Generate rent for ${formatMonth(month)}?`}
          message="A rent record is created for each active resident who joined by the end of that month and does not have one yet. Existing records and payments are not changed."
          confirmText="Generate rent"
          tone="warning"
          loading={generating}
          onConfirm={generate}
          onCancel={() => setGenerateOpen(false)}
        />
      )}

      {result && (
        <Modal title="Rent generation complete" onClose={() => setResult(null)} size="sm">
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="rounded-xl bg-emerald-50 p-4">
              <p className="text-2xl font-extrabold text-emerald-700">{result.created}</p>
              <p className="text-sm text-slate-600">Records created</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-2xl font-extrabold text-slate-700">{result.skipped}</p>
              <p className="text-sm text-slate-600">Already existed</p>
            </div>
          </div>
          <p className="mt-3 text-sm text-slate-500">
            {result.created === 0 && result.skipped === 0
              ? `No active residents were eligible for ${formatMonth(result.month)}. A resident is eligible if they joined on or before the end of that month.`
              : result.created === 0
                ? 'Every eligible resident already had a rent record, so nothing was created.'
                : `Rent for ${formatMonth(result.month)} is ready. Existing records were not touched.`}
          </p>
          <button className="btn-primary mt-4 w-full" onClick={() => setResult(null)}>OK</button>
        </Modal>
      )}

      {detailsId && (
        <RentDetailsModal
          recordId={detailsId}
          onClose={() => setDetailsId(null)}
          onRecordPayment={(record) => {
            setDetailsId(null);
            setPayRecord(record);
          }}
        />
      )}

      {payRecord && <RecordPaymentModal record={payRecord} onClose={() => setPayRecord(null)} onSaved={paymentSaved} />}
    </div>
  );
}