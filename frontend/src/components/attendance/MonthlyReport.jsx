import { useMemo, useState } from 'react';
import { CalendarX2, Percent, SearchX, UserCheck, UserMinus, UserX } from 'lucide-react';
import api from '../../api/client.js';
import useFetch from '../../hooks/useFetch.js';
import StatCard from '../ui/StatCard.jsx';
import SearchInput from '../ui/SearchInput.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import ErrorState from '../ui/ErrorState.jsx';
import StatusBadge from '../ui/StatusBadge.jsx';
import { Select } from '../ui/FormControls.jsx';
import { currentMonth, formatMonth } from '../../utils/format.js';
import { MONTH_NAMES, toMonthKey } from '../../utils/dates.js';

const pctText = (p) => (p === null ? '—' : `${p}%`);
const round1 = (n) => Math.round(n * 10) / 10;

const PctBar = ({ pct }) =>
  pct === null ? (
    <span className="text-slate-400">—</span>
  ) : (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-teal-500" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="w-12 font-semibold text-slate-800">{pct}%</span>
    </div>
  );

export default function MonthlyReport({ rooms }) {
  const now = currentMonth();
  const nowYear = Number(now.slice(0, 4));
  const nowMon = Number(now.slice(5, 7));
  const [year, setYear] = useState(nowYear);
  const [mon, setMon] = useState(nowMon);
  const [search, setSearch] = useState('');
  const [roomFilter, setRoomFilter] = useState('');
  const month = toMonthKey(year, mon);

  const summary = useFetch(async () => (await api.get('/attendance/summary', { params: { month } })).data, [month]);
  // Used for room numbers and to include active residents who have no attendance yet
  const people = useFetch(async () => (await api.get('/residents')).data.data, []);

  const ready = summary.data && summary.data.month === month && people.data;
  const error = (!ready && (summary.error || people.error)) || '';

  const pickYear = (y) => {
    setYear(y);
    if (y === nowYear && mon > nowMon) setMon(nowMon); // the backend rejects future months
  };

  const rows = useMemo(() => {
    if (!ready) return [];
    const byId = new Map(people.data.map((p) => [p._id, p]));
    const map = new Map();
    summary.data.data.forEach((s) => {
      const id = s.resident._id;
      const person = byId.get(id);
      map.set(id, {
        id,
        name: s.resident.fullName,
        left: s.resident.status === 'Left',
        room: s.resident.room?.roomNumber ?? person?.room?.roomNumber ?? '',
        roomId: person?.room?._id ?? '',
        present: s.Present || 0,
        absent: s.Absent || 0,
        leave: s['On Leave'] || 0,
      });
    });
    people.data
      .filter((p) => p.status === 'Active' && !map.has(p._id))
      .forEach((p) =>
        map.set(p._id, { id: p._id, name: p.fullName, left: false, room: p.room?.roomNumber || '', roomId: p.room?._id || '', present: 0, absent: 0, leave: 0 })
      );
    return [...map.values()].map((r) => {
      const marked = r.present + r.absent + r.leave;
      // Attendance % = Present / (Present + Absent + On Leave). Unmarked days are not counted.
      return { ...r, marked, pct: marked ? round1((r.present / marked) * 100) : null };
    });
  }, [ready, summary.data, people.data]);

  const term = search.trim().toLowerCase();
  const shown = rows
    .filter((r) => r.name.toLowerCase().includes(term) && (!roomFilter || r.roomId === roomFilter))
    .sort((a, b) => a.room.localeCompare(b.room, undefined, { numeric: true }) || a.name.localeCompare(b.name));

  const totals = shown.reduce(
    (t, r) => ({ present: t.present + r.present, absent: t.absent + r.absent, leave: t.leave + r.leave }),
    { present: 0, absent: 0, leave: 0 }
  );
  const totalMarked = totals.present + totals.absent + totals.leave;
  const overall = totalMarked ? round1((totals.present / totalMarked) * 100) : null;
  const filtersActive = Boolean(term) || Boolean(roomFilter);
  const years = [nowYear, nowYear - 1, nowYear - 2, nowYear - 3];

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 md:flex md:items-center">
        <Select value={mon} onChange={(e) => setMon(Number(e.target.value))} aria-label="Month" className="md:w-44">
          {MONTH_NAMES.map((name, i) => (
            <option key={name} value={i + 1} disabled={year === nowYear && i + 1 > nowMon}>{name}</option>
          ))}
        </Select>
        <Select value={year} onChange={(e) => pickYear(Number(e.target.value))} aria-label="Year" className="md:w-32">
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </Select>
        <SearchInput value={search} onChange={setSearch} placeholder="Search by resident name" className="col-span-2 md:flex-1" />
        <Select value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)} aria-label="Filter by room" className="col-span-2 md:col-span-1 md:w-44">
          <option value="">All rooms</option>
          {rooms.map((r) => <option key={r._id} value={r._id}>Room {r.roomNumber}</option>)}
        </Select>
      </div>

      <p className="mb-4 text-sm font-semibold text-slate-600">{formatMonth(month)}</p>

      {!ready && !error ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>
          <Skeleton className="h-64" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={() => { summary.reload(); people.reload(); }} />
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState icon={CalendarX2} title="No attendance for this month" text="No residents have attendance recorded for this month." />
        </div>
      ) : (
        <div className={summary.loading ? 'opacity-70 transition' : 'transition'}>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon={UserCheck} label="Present days" value={totals.present} tone="emerald" />
            <StatCard icon={UserX} label="Absent days" value={totals.absent} tone="rose" />
            <StatCard icon={UserMinus} label="On leave days" value={totals.leave} tone="orange" />
            <StatCard icon={Percent} label="Overall attendance" value={pctText(overall)} sub={`${totalMarked} marked days`} tone="teal" />
          </div>

          {shown.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={SearchX}
                title="No residents match"
                text="Try a different name or room."
                action={filtersActive && <button className="btn-secondary" onClick={() => { setSearch(''); setRoomFilter(''); }}>Clear filters</button>}
              />
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="card hidden overflow-hidden md:block">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Resident</th>
                        <th className="px-4 py-3 font-semibold">Room</th>
                        <th className="px-4 py-3 text-center font-semibold">Present</th>
                        <th className="px-4 py-3 text-center font-semibold">Absent</th>
                        <th className="px-4 py-3 text-center font-semibold">On Leave</th>
                        <th className="px-4 py-3 text-center font-semibold">Marked days</th>
                        <th className="px-4 py-3 font-semibold">Attendance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {shown.map((r) => (
                        <tr key={r.id}>
                          <td className="px-4 py-3 font-semibold text-slate-900">
                            {r.name} {r.left && <StatusBadge status="Left" />}
                          </td>
                          <td className="px-4 py-3 text-slate-700">{r.room || '-'}</td>
                          <td className="px-4 py-3 text-center font-semibold text-emerald-600">{r.present}</td>
                          <td className="px-4 py-3 text-center font-semibold text-rose-600">{r.absent}</td>
                          <td className="px-4 py-3 text-center font-semibold text-amber-600">{r.leave}</td>
                          <td className="px-4 py-3 text-center text-slate-600">{r.marked}</td>
                          <td className="px-4 py-3"><PctBar pct={r.pct} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile cards */}
              <ul className="space-y-3 md:hidden">
                {shown.map((r) => (
                  <li key={r.id} className="card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">{r.name}</p>
                        <p className="text-xs text-slate-500">Room {r.room || '-'} {r.left && '· Left'}</p>
                      </div>
                      <PctBar pct={r.pct} />
                    </div>
                    <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                      <div className="rounded-xl bg-emerald-50 py-2"><p className="text-base font-bold text-emerald-700">{r.present}</p>Present</div>
                      <div className="rounded-xl bg-rose-50 py-2"><p className="text-base font-bold text-rose-700">{r.absent}</p>Absent</div>
                      <div className="rounded-xl bg-amber-50 py-2"><p className="text-base font-bold text-amber-700">{r.leave}</p>On Leave</div>
                      <div className="rounded-xl bg-slate-50 py-2"><p className="text-base font-bold text-slate-700">{r.marked}</p>Marked</div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            Attendance % = Present days ÷ marked days (Present + Absent + On Leave). Days with no attendance recorded are not counted
            as absent. Residents with no marked days show —.
          </p>
        </div>
      )}
    </div>
  );
}