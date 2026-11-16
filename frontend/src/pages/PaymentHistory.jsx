import { useMemo, useState } from 'react';
import { History, IndianRupee, SearchX, Users } from 'lucide-react';
import api from '../api/client.js';
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

export default function PaymentHistory() {
  // There is no standalone payment endpoint, so history is built from the payments[] of every rent record.
  const { data, loading, error, reload } = useFetch(async () => (await api.get('/rent')).data.data, []);
  const [view, setView] = useState('Transactions');
  const [search, setSearch] = useState('');
  const [residentFilter, setResidentFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');

  const records = data || [];

  const payments = useMemo(
    () =>
      records
        .flatMap((r) =>
          r.payments.map((p) => ({
            id: p._id,
            residentId: r.resident?._id || '',
            resident: r.resident?.fullName || 'Unknown',
            room: r.room?.roomNumber || '-',
            month: r.month,
            amount: p.amount,
            paidOn: p.paidOn,
            method: p.method,
            note: p.note || '',
          }))
        )
        .sort((a, b) => new Date(b.paidOn) - new Date(a.paidOn)),
    [records]
  );

  const residents = useMemo(() => {
    const map = new Map();
    records.forEach((r) => r.resident && map.set(r.resident._id, `${r.resident.fullName} (Room ${r.room?.roomNumber || '-'})`));
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [records]);
  const months = useMemo(() => [...new Set(records.map((r) => r.month))].sort().reverse(), [records]);

  const term = search.trim().toLowerCase();
  const filtered = payments.filter(
    (p) =>
      (!residentFilter || p.residentId === residentFilter) &&
      (!monthFilter || p.month === monthFilter) &&
      (!term || `${p.resident} ${p.room} ${p.method} ${p.note}`.toLowerCase().includes(term))
  );
  const total = round2(filtered.reduce((s, p) => s + p.amount, 0));
  const filtersActive = Boolean(term) || Boolean(residentFilter) || Boolean(monthFilter);
  const clearFilters = () => {
    setSearch('');
    setResidentFilter('');
    setMonthFilter('');
  };

  const grouped = useMemo(() => {
    const map = new Map();
    filtered.forEach((p) => {
      if (!map.has(p.residentId)) map.set(p.residentId, { id: p.residentId, name: p.resident, room: p.room, total: 0, items: [] });
      const g = map.get(p.residentId);
      g.total = round2(g.total + p.amount);
      g.items.push(p);
    });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [filtered]);

  return (
    <div>
      <PageHeader title="Payment History" subtitle="Rent payments, every installment" />

      {loading && !data ? (
        <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : payments.length === 0 ? (
        <div className="card">
          <EmptyState icon={History} title="No payments recorded yet" text="Rent payments you record on the Rent page appear here." />
        </div>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-3 gap-2 sm:gap-3">
            <StatCard icon={IndianRupee} label="Collected" value={formatCurrency(total)} tone="emerald" />
            <StatCard icon={History} label="Payments" value={filtered.length} tone="navy" />
            <StatCard icon={Users} label="Residents" value={new Set(filtered.map((p) => p.residentId)).size} tone="teal" />
          </div>

          <div className="mb-4 space-y-3">
            <SearchInput value={search} onChange={setSearch} placeholder="Search name, room, method or note" />
            <div className="grid grid-cols-2 gap-3 md:flex md:items-center">
              <Select value={residentFilter} onChange={(e) => setResidentFilter(e.target.value)} aria-label="Filter by resident" className="md:w-64">
                <option value="">All residents</option>
                {residents.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </Select>
              <Select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} aria-label="Filter by rent month" className="md:w-48">
                <option value="">All months</option>
                {months.map((m) => <option key={m} value={m}>{formatMonth(m)}</option>)}
              </Select>
              {filtersActive && <button className="btn-secondary col-span-2 md:col-span-1" onClick={clearFilters}>Clear filters</button>}
              <div className="col-span-2 md:col-span-1 md:ml-auto">
                <SegmentedControl options={['Transactions', 'By resident']} value={view} onChange={setView} />
              </div>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="card">
              <EmptyState icon={SearchX} title="No payments match" text="Try different filters." action={<button className="btn-secondary" onClick={clearFilters}>Clear filters</button>} />
            </div>
          ) : view === 'Transactions' ? (
            <>
              <div className="card hidden overflow-hidden md:block">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Date and time</th>
                        <th className="px-4 py-3 font-semibold">Resident</th>
                        <th className="px-4 py-3 font-semibold">Room</th>
                        <th className="px-4 py-3 font-semibold">Rent month</th>
                        <th className="px-4 py-3 font-semibold">Method</th>
                        <th className="px-4 py-3 font-semibold">Reference / note</th>
                        <th className="px-4 py-3 text-right font-semibold">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filtered.map((p) => (
                        <tr key={p.id}>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDateTime(p.paidOn)}</td>
                          <td className="px-4 py-3 font-semibold text-slate-900">{p.resident}</td>
                          <td className="px-4 py-3 text-slate-700">{p.room}</td>
                          <td className="px-4 py-3 text-slate-600">{formatMonth(p.month)}</td>
                          <td className="px-4 py-3 text-slate-600">{p.method}</td>
                          <td className="max-w-56 truncate px-4 py-3 text-slate-500" title={p.note}>{p.note || '-'}</td>
                          <td className="px-4 py-3 text-right font-bold text-emerald-600">+{formatCurrency(p.amount)}</td>
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
                        <p className="text-xs text-slate-500">Room {p.room} · Rent for {formatMonth(p.month)}</p>
                      </div>
                      <span className="shrink-0 font-bold text-emerald-600">+{formatCurrency(p.amount)}</span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">{formatDateTime(p.paidOn)} · {p.method}</p>
                    {p.note && <p className="mt-1 break-words text-xs text-slate-500">{p.note}</p>}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <ul className="space-y-3">
              {grouped.map((g) => (
                <li key={g.id || g.name} className="card overflow-hidden">
                  <details>
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">{g.name}</p>
                        <p className="text-xs text-slate-500">Room {g.room} · {g.items.length} payment{g.items.length === 1 ? '' : 's'}</p>
                      </div>
                      <span className="shrink-0 font-bold text-emerald-600">{formatCurrency(g.total)}</span>
                    </summary>
                    <ul className="divide-y divide-slate-100 border-t border-slate-100">
                      {g.items.map((p) => (
                        <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800">{formatDateTime(p.paidOn)}</p>
                            <p className="truncate text-xs text-slate-500">
                              {p.method} · Rent for {formatMonth(p.month)}{p.note ? ` · ${p.note}` : ''}
                            </p>
                          </div>
                          <span className="shrink-0 text-sm font-bold text-emerald-600">+{formatCurrency(p.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-4 text-xs leading-relaxed text-slate-400">
            Payment records are permanent and read-only. This page shows rent payments only; electricity payments will be added with the Electricity module.
          </p>
        </>
      )}
    </div>
  );
}