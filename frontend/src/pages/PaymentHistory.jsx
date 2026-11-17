import { useMemo, useState } from 'react';
import { Download, History, IndianRupee, SearchX, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import useFetch from '../hooks/useFetch.js';
import PageHeader from '../components/ui/PageHeader.jsx';
import StatCard from '../components/ui/StatCard.jsx';
import SearchInput from '../components/ui/SearchInput.jsx';
import SegmentedControl from '../components/ui/SegmentedControl.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import { Select } from '../components/ui/FormControls.jsx';
import { formatCurrency, formatDateTime, formatMonth, round2 } from '../utils/format.js';
import { downloadPaymentReceipt } from '../utils/pdf.js';

export default function PaymentHistory() {
  const { owner } = useAuth();
  const { data: rentData, loading: rentLoading, error: rentError, reload: reloadRent } = useFetch(async () => (await api.get('/rent')).data.data, []);
  const { data: elecData, loading: elecLoading, error: elecError, reload: reloadElec } = useFetch(async () => (await api.get('/electricity')).data.data, []);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [residentFilter, setResidentFilter] = useState('');
  const [roomFilter, setRoomFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [view, setView] = useState('Transactions');

  const loading = rentLoading || elecLoading;
  const error = rentError || elecError;
  const reload = () => { reloadRent(); reloadElec(); };

  const payments = useMemo(() => {
    const rentPayments = (rentData || []).flatMap((r) =>
      r.payments.map((p) => ({
        id: `rent-${r._id}-${p._id}`,
        type: 'Rent',
        payment: p,
        sourceRecord: r,
        residentId: r.resident?._id || '',
        resident: r.resident?.fullName || 'Unknown',
        roomId: r.room?._id || '',
        room: r.room?.roomNumber || '-',
        month: r.month,
        amount: p.amount,
        paidOn: p.paidOn,
        method: p.method,
        note: p.note || '',
        receiptReady: Boolean(p._id),
      }))
    );

    const elecPayments = (elecData || []).flatMap((b) =>
      b.payments.map((p) => ({
        id: `electricity-${b._id}-${p._id}`,
        type: 'Electricity',
        payment: p,
        sourceRecord: b,
        residentId: b.room?._id || '',
        resident: `Room ${b.room?.roomNumber || '-'}`,
        roomId: b.room?._id || '',
        room: b.room?.roomNumber || '-',
        month: b.month,
        amount: p.amount,
        paidOn: p.paidOn,
        method: p.method,
        note: p.note || '',
        receiptReady: Boolean(p._id),
      }))
    );

    return [...rentPayments, ...elecPayments].sort((a, b) => new Date(b.paidOn) - new Date(a.paidOn));
  }, [rentData, elecData]);

  const residents = useMemo(() => {
    const map = new Map();
    (rentData || []).forEach((r) => {
      if (r.resident) map.set(r.resident._id, `${r.resident.fullName} (Room ${r.room?.roomNumber || '-'})`);
    });
    (elecData || []).forEach((b) => {
      if (b.room) map.set(b.room._id, `Room ${b.room.roomNumber}`);
    });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rentData, elecData]);

  const rooms = useMemo(() => {
    const map = new Map();
    [...(rentData || []), ...(elecData || [])].forEach((item) => {
      const room = item.room || item;
      if (room && room._id && room.roomNumber) map.set(room._id, `Room ${room.roomNumber}`);
    });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rentData, elecData]);

  const months = useMemo(() => {
    const set = new Set();
    (rentData || []).forEach((r) => set.add(r.month));
    (elecData || []).forEach((b) => set.add(b.month));
    return [...set].sort().reverse();
  }, [rentData, elecData]);

  const term = search.trim().toLowerCase();
  const filtered = payments.filter(
    (p) =>
      (typeFilter === 'All' || p.type === typeFilter) &&
      (!residentFilter || p.residentId === residentFilter) &&
      (!roomFilter || p.roomId === roomFilter) &&
      (!monthFilter || p.month === monthFilter) &&
      (!term || `${p.resident} ${p.room} ${p.method} ${p.note} ${p.type}`.toLowerCase().includes(term))
  );

  const totals = filtered.reduce(
    (acc, p) => {
      acc.total += p.amount;
      acc[p.type] += p.amount;
      return acc;
    },
    { total: 0, Rent: 0, Electricity: 0 }
  );

  const filtersActive = Boolean(typeFilter !== 'All') || Boolean(term) || Boolean(residentFilter) || Boolean(roomFilter) || Boolean(monthFilter);
  const clearFilters = () => {
    setTypeFilter('All');
    setSearch('');
    setResidentFilter('');
    setRoomFilter('');
    setMonthFilter('');
  };
  const downloadReceipt = async (payment) => {
    try {
      await downloadPaymentReceipt(payment.type, payment.sourceRecord, payment.payment, owner);
    } catch (err) {
      toast.error(err.message || 'Could not create receipt');
    }
  };

  const grouped = useMemo(() => {
    const map = new Map();
    filtered.forEach((p) => {
      const key = `${p.type}-${p.residentId}`;
      if (!map.has(key)) {
        map.set(key, { id: key, name: p.resident, room: p.room, total: 0, items: [] });
      }
      const g = map.get(key);
      g.total = round2(g.total + p.amount);
      g.items.push(p);
    });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [filtered]);

  return (
    <div>
      <PageHeader title="Payment History" subtitle="Rent and electricity payments" />

      {loading && !payments.length ? (
        <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : error && !payments.length ? (
        <ErrorState message={error} onRetry={reload} />
      ) : payments.length === 0 ? (
        <div className="card">
          <EmptyState icon={History} title="No payments recorded yet" text="Payment entries from Rent and Electricity pages appear here." />
        </div>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-4 gap-2 sm:gap-3">
            <StatCard icon={IndianRupee} label="Collected" value={formatCurrency(totals.total)} tone="emerald" />
            <StatCard icon={IndianRupee} label="Rent" value={formatCurrency(totals.Rent)} tone="navy" />
            <StatCard icon={Zap} label="Electricity" value={formatCurrency(totals.Electricity)} tone="teal" />
            <StatCard icon={History} label="Payments" value={filtered.length} tone="navy" />
          </div>

          <div className="mb-4 space-y-3">
            <SearchInput value={search} onChange={setSearch} placeholder="Search name, room, method or note" />
            <div className="grid grid-cols-2 gap-3 md:flex md:items-center">
              <Select value={residentFilter} onChange={(e) => setResidentFilter(e.target.value)} aria-label="Filter by resident" className="md:w-64">
                <option value="">All residents</option>
                {residents.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </Select>
              <Select value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)} aria-label="Filter by room" className="md:w-48">
                <option value="">All rooms</option>
                {rooms.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </Select>
              <Select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} aria-label="Filter by billing month" className="md:w-48">
                <option value="">All months</option>
                {months.map((m) => <option key={m} value={m}>{formatMonth(m)}</option>)}
              </Select>
              {filtersActive && <button className="btn-secondary col-span-2 md:col-span-1" onClick={clearFilters}>Clear filters</button>}
              <div className="col-span-2 md:col-span-1 md:ml-auto">
                <SegmentedControl options={['Transactions', 'By resident']} value={view} onChange={setView} />
              </div>
            </div>
            <div className="md:flex md:justify-end">
              <SegmentedControl options={['All', 'Rent', 'Electricity']} value={typeFilter} onChange={setTypeFilter} />
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="card">
              <EmptyState icon={SearchX} title="No payments match" text="Try different filters or date ranges." action={<button className="btn-secondary" onClick={clearFilters}>Clear filters</button>} />
            </div>
          ) : view === 'Transactions' ? (
            <>
              <div className="card hidden overflow-hidden md:block">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Date and time</th>
                        <th className="px-4 py-3 font-semibold">Type</th>
                        <th className="px-4 py-3 font-semibold">Resident / Room</th>
                        <th className="px-4 py-3 font-semibold">Room</th>
                        <th className="px-4 py-3 font-semibold">Billing month</th>
                        <th className="px-4 py-3 font-semibold">Method</th>
                        <th className="px-4 py-3 font-semibold">Reference / note</th>
                        <th className="px-4 py-3 text-right font-semibold">Amount</th>
                        <th className="px-4 py-3 text-right font-semibold">Receipt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filtered.map((p) => (
                        <tr key={p.id}>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDateTime(p.paidOn)}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${p.type === 'Rent' ? 'bg-navy-50 text-navy-700' : 'bg-teal-50 text-teal-700'}`}>
                              {p.type}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-900">{p.resident}</td>
                          <td className="px-4 py-3 text-slate-700">{p.room}</td>
                          <td className="px-4 py-3 text-slate-600">{formatMonth(p.month)}</td>
                          <td className="px-4 py-3 text-slate-600">{p.method}</td>
                          <td className="max-w-56 truncate px-4 py-3 text-slate-500" title={p.note}>{p.note || '-'}</td>
                          <td className="px-4 py-3 text-right font-bold text-emerald-600">+{formatCurrency(p.amount)}</td>
                          <td className="px-4 py-3 text-right">
                            {p.receiptReady && <button className="btn-secondary min-h-9 px-2.5" onClick={() => downloadReceipt(p)}><Download size={15} /> PDF</button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <ul className="space-y-3 md:hidden">
                {filtered.map((p) => (
                  <li key={p.id} className="card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">{p.resident}</p>
                        <p className="text-xs text-slate-500">{p.type} · Room {p.room} · {formatMonth(p.month)}</p>
                      </div>
                      <span className="shrink-0 font-bold text-emerald-600">+{formatCurrency(p.amount)}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                      <span className={`inline-flex rounded-full px-2 py-1 font-semibold ${p.type === 'Rent' ? 'bg-navy-50 text-navy-700' : 'bg-teal-50 text-teal-700'}`}>{p.type}</span>
                      <span>{p.method}</span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">{formatDateTime(p.paidOn)}</p>
                    {p.note && <p className="mt-1 break-words text-xs text-slate-500">{p.note}</p>}
                    {p.receiptReady && <button className="btn-secondary mt-3 min-h-9" onClick={() => downloadReceipt(p)}><Download size={15} /> Download receipt</button>}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <ul className="space-y-3">
              {grouped.map((g) => (
                <li key={g.id} className="card overflow-hidden">
                  <details>
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">{g.name}</p>
                        <p className="text-xs text-slate-500">{g.items[0]?.type} · Room {g.room} · {g.items.length} payment{g.items.length === 1 ? '' : 's'}</p>
                      </div>
                      <span className="shrink-0 font-bold text-emerald-600">{formatCurrency(g.total)}</span>
                    </summary>
                    <ul className="divide-y divide-slate-100 border-t border-slate-100">
                      {g.items.map((p) => (
                        <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800">{formatDateTime(p.paidOn)}</p>
                            <p className="truncate text-xs text-slate-500">
                              {p.type} · {p.method} · {formatMonth(p.month)}{p.note ? ` · ${p.note}` : ''}
                            </p>
                          </div>
                          <span className="shrink-0 text-sm font-bold text-emerald-600">+{formatCurrency(p.amount)}</span>
                          {p.receiptReady && <button className="btn-secondary min-h-9 shrink-0 px-2.5" onClick={() => downloadReceipt(p)} aria-label={`Download ${p.type.toLowerCase()} receipt`}><Download size={15} /> PDF</button>}
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-4 text-xs leading-relaxed text-slate-400">
            Payment records are permanent and read-only. This combined history covers all logged rent and electricity payments for all relevant billing months, not just the current month.
          </p>
        </>
      )}
    </div>
  );
}
