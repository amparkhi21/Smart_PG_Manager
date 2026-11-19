import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CheckCheck, HelpCircle, Loader2, SearchX, UserCheck, UserMinus, UserX, Users } from 'lucide-react';
import api from '../../api/client.js';
import useFetch from '../../hooks/useFetch.js';
import StatCard from '../ui/StatCard.jsx';
import SearchInput from '../ui/SearchInput.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import ErrorState from '../ui/ErrorState.jsx';
import ConfirmDialog from '../ui/ConfirmDialog.jsx';
import { Select } from '../ui/FormControls.jsx';
import DateNavigator from './DateNavigator.jsx';
import AttendanceRow from './AttendanceRow.jsx';
import { formatDate, getErrorMessage, todayInput } from '../../utils/format.js';
import { weekdayLabel } from '../../utils/dates.js';

const STATUS_FILTERS = ['All', 'Present', 'Absent', 'On Leave', 'Unmarked'];
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const byRoomThenName = (a, b) =>
  (a.room?.roomNumber || '').localeCompare(b.room?.roomNumber || '', undefined, { numeric: true }) ||
  a.resident.fullName.localeCompare(b.resident.fullName);

export default function DailyAttendance({ rooms, visible }) {
  const today = todayInput(); // India date
  const [date, setDate] = useState(today);
  const [roomFilter, setRoomFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState({}); // residentId -> { status, note } (unsaved edits only)
  const [saving, setSaving] = useState(false);
  const [pendingDate, setPendingDate] = useState(null);
  const [markAllOpen, setMarkAllOpen] = useState(false);

  const { data, loading, error, reload } = useFetch(
    async () => (await api.get('/attendance', { params: { date, ...(roomFilter && { room: roomFilter }) } })).data,
    [date, roomFilter]
  );

  const dirtyCount = Object.keys(draft).length;
  const ready = data && data.date === date; // never show or edit another date's rows

  // Warn before closing the tab with unsaved edits
  useEffect(() => {
    if (!dirtyCount) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirtyCount]);

  const applyDate = (next) => {
    setDraft({});
    setDate(next);
  };
  const requestDate = (next) => {
    if (!next || next === date || next > today) return;
    if (dirtyCount > 0) setPendingDate(next);
    else applyDate(next);
  };

  const effective = (row) => (draft[row.resident._id] ? draft[row.resident._id].status : row.status);

  // Keep a draft only while it differs from what is saved
  const updateDraft = (row, next) => {
    const id = row.resident._id;
    setDraft((prev) => {
      const out = { ...prev };
      if (next.status === row.status && next.note === (row.note || '')) delete out[id];
      else out[id] = next;
      return out;
    });
  };

  const rows = ready ? data.data : [];
  const term = search.trim().toLowerCase();
  const shown = rows
    .filter((r) => r.resident.fullName.toLowerCase().includes(term))
    .filter((r) => statusFilter === 'All' || (effective(r) || 'Unmarked') === statusFilter)
    .sort(byRoomThenName);
  const unmarkedShown = shown.filter((r) => !effective(r));
  const filtersActive = Boolean(term) || Boolean(roomFilter) || statusFilter !== 'All';

  const clearFilters = () => {
    setSearch('');
    setRoomFilter('');
    setStatusFilter('All');
  };

  // Sends everything in one bulk request (the backend accepts up to 200 records per call)
  const save = async (extra = []) => {
    const records = [
      ...Object.entries(draft).map(([resident, d]) => ({ resident, status: d.status, note: (d.note || '').trim() })),
      ...extra,
    ];
    if (!records.length || saving) return;
    setSaving(true);
    try {
      for (let i = 0; i < records.length; i += 200) {
        await api.put('/attendance', { date, records: records.slice(i, i + 200) });
      }
      toast.success(`Attendance saved for ${plural(records.length, 'resident')}`);
      await reload();
      setDraft({});
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const confirmMarkAll = async () => {
    const extra = unmarkedShown.map((r) => ({ resident: r.resident._id, status: 'Present', note: '' }));
    await save(extra);
    setMarkAllOpen(false);
  };

  const summary = ready ? data.summary : null;

  return (
    <div className={visible ? '' : 'hidden'}>
      {/* Date */}
      <div className="mb-4">
        <DateNavigator date={date} today={today} onChange={requestDate} disabled={saving} />
        <p className="mt-2 text-sm text-slate-500">
          {weekdayLabel(date)}, {formatDate(date)}
          {date === today && <span className="ml-2 rounded-full bg-teal-50 px-2 py-0.5 text-xs font-bold text-teal-700">Today</span>}
        </p>
      </div>

      {/* Saved summary for this date */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={UserCheck} label="Present" value={summary?.Present} tone="emerald" loading={!summary} />
        <StatCard icon={UserX} label="Absent" value={summary?.Absent} tone="rose" loading={!summary} />
        <StatCard icon={UserMinus} label="On Leave" value={summary?.['On Leave']} tone="orange" loading={!summary} />
        <StatCard icon={HelpCircle} label="Unmarked" value={summary?.Unmarked} tone="navy" loading={!summary} />
      </div>

      {/* Filters */}
      <div className="mb-4 space-y-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by resident name" />
        <div className="grid grid-cols-2 gap-3 md:flex md:items-center">
          <Select value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)} aria-label="Filter by room" className="md:w-48">
            <option value="">All rooms</option>
            {rooms.map((r) => <option key={r._id} value={r._id}>Room {r.roomNumber}</option>)}
          </Select>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status" className="md:w-44">
            {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s === 'All' ? 'All statuses' : s}</option>)}
          </Select>
          {filtersActive && (
            <button type="button" className="btn-secondary col-span-2 md:col-span-1" onClick={clearFilters}>Clear filters</button>
          )}
          <button
            type="button"
            className="btn-primary col-span-2 md:ml-auto md:col-span-1"
            disabled={!ready || saving || unmarkedShown.length === 0}
            onClick={() => setMarkAllOpen(true)}
          >
            <CheckCheck size={18} /> Mark all present
          </button>
        </div>
      </div>

      {/* List */}
      {!ready && !error ? (
        <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : error && !ready ? (
        <ErrorState message={error} onRetry={reload} />
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Users}
            title={roomFilter ? 'No active residents in this room' : 'No active residents'}
            text="Attendance is marked for active residents. Add residents to get started."
            action={roomFilter ? <button className="btn-secondary" onClick={clearFilters}>Clear filters</button> : <Link to="/residents" className="btn-accent">Go to residents</Link>}
          />
        </div>
      ) : shown.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={SearchX}
            title="No residents match"
            text="Try a different name or status."
            action={<button className="btn-secondary" onClick={clearFilters}>Clear filters</button>}
          />
        </div>
      ) : (
        <ul className={`space-y-3 transition ${loading ? 'opacity-70' : ''}`}>
          {shown.map((row) => (
            <AttendanceRow
              key={row.resident._id}
              row={row}
              draft={draft[row.resident._id]}
              disabled={saving}
              onChange={(next) => updateDraft(row, next)}
            />
          ))}
        </ul>
      )}

      {dirtyCount > 0 && <div className="h-20" />}

      {/* Save bar */}
      {visible && dirtyCount > 0 && (
        <div className="fixed inset-x-3 bottom-[calc(4.75rem+var(--app-safe-bottom))] z-30 lg:inset-x-auto lg:bottom-6 lg:right-8 lg:w-[30rem]">
          <div className="flex items-center gap-2 rounded-2xl bg-navy-900 p-3 text-white shadow-xl">
            <p className="min-w-0 flex-1 text-sm font-semibold">{plural(dirtyCount, 'unsaved change')}</p>
            <button
              type="button"
              disabled={saving}
              onClick={() => setDraft({})}
              className="rounded-xl px-3 py-2 text-sm font-semibold text-navy-100 hover:bg-white/10 disabled:opacity-50"
            >
              Discard
            </button>
            <button type="button" disabled={saving} onClick={() => save()} className="btn-accent min-h-10">
              {saving && <Loader2 size={16} className="animate-spin" />}
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {markAllOpen && (
        <ConfirmDialog
          title="Mark all as present?"
          message={`This will save ${plural(unmarkedShown.length, 'unmarked resident')} as Present for ${formatDate(date)}. Residents already marked Present, Absent or On Leave will not be changed.${
            dirtyCount ? ` Your ${plural(dirtyCount, 'unsaved change')} will be saved too.` : ''
          }`}
          confirmText="Mark present and save"
          tone="warning"
          loading={saving}
          onConfirm={confirmMarkAll}
          onCancel={() => setMarkAllOpen(false)}
        />
      )}

      {pendingDate && (
        <ConfirmDialog
          title="Discard unsaved changes?"
          message={`You have ${plural(dirtyCount, 'unsaved change')}. Switching to ${formatDate(pendingDate)} will discard them.`}
          confirmText="Discard and switch"
          onConfirm={() => {
            applyDate(pendingDate);
            setPendingDate(null);
          }}
          onCancel={() => setPendingDate(null)}
        />
      )}
    </div>
  );
}
