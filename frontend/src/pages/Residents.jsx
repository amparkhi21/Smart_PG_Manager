import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Pencil, Plus, SearchX, Users } from 'lucide-react';
import api from '../api/client.js';
import useFetch from '../hooks/useFetch.js';
import useDebounce from '../hooks/useDebounce.js';
import PageHeader from '../components/ui/PageHeader.jsx';
import SearchInput from '../components/ui/SearchInput.jsx';
import SegmentedControl from '../components/ui/SegmentedControl.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import IconButton from '../components/ui/IconButton.jsx';
import { Select } from '../components/ui/FormControls.jsx';
import ResidentFormModal from '../components/residents/ResidentFormModal.jsx';
import PgCode from '../components/residents/PgCode.jsx';
import { formatCurrency, formatDate } from '../utils/format.js';

const ACCOUNT_LABELS = { active: 'Login enabled', disabled: 'Login disabled', unconfigured: 'Not configured' };

const Avatar = ({ name }) => (
  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy-50 font-bold text-navy-700">
    {name.charAt(0).toUpperCase()}
  </span>
);

export default function Residents() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('Active');
  const [roomFilter, setRoomFilter] = useState('');
  const [accountStatus, setAccountStatus] = useState('');
  const [formResident, setFormResident] = useState(undefined); // undefined = closed, null = add, object = edit
  const q = useDebounce(search);

  const { data: rooms } = useFetch(async () => (await api.get('/rooms')).data.data, []);
  const { data, loading, error, reload } = useFetch(async () => {
    const params = {};
    if (q.trim()) params.search = q.trim();
    if (status !== 'All') params.status = status;
    if (roomFilter) params.room = roomFilter;
    return (await api.get('/residents', { params })).data.data;
  }, [q, status, roomFilter]);

  // The existing API returns the complete matching list, including legacy records.
  const residents = (data || []).filter((resident) => !accountStatus || (resident.accountStatus || 'unconfigured') === accountStatus);
  const filtersActive = Boolean(q.trim()) || status !== 'Active' || Boolean(roomFilter) || Boolean(accountStatus);
  const closeForm = () => setFormResident(undefined);
  const saved = () => {
    closeForm();
    reload();
  };
  const clearFilters = () => {
    setSearch('');
    setStatus('Active');
    setRoomFilter('');
    setAccountStatus('');
  };

  return (
    <div>
      <PageHeader title="Residents" subtitle={data ? `${residents.length} shown` : 'Manage your residents'}>
        <button className="btn-accent" onClick={() => setFormResident(null)}>
          <Plus size={18} /> Add resident
        </button>
      </PageHeader>

      <PgCode className="card mb-4 p-4" />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 md:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by name or phone" />
        <SegmentedControl options={['Active', 'Left', 'All']} value={status} onChange={setStatus} />
        <Select value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)} aria-label="Filter by room">
          <option value="">All rooms</option>
          {(rooms || []).map((r) => (
            <option key={r._id} value={r._id}>Room {r.roomNumber}</option>
          ))}
        </Select>
        <Select value={accountStatus} onChange={(e) => setAccountStatus(e.target.value)} aria-label="Filter by account status">
          <option value="">All login accounts</option>
          {Object.entries(ACCOUNT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
      </div>

      {loading && !data ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : residents.length === 0 ? (
        <div className="card">
          {filtersActive ? (
            <EmptyState
              icon={SearchX}
              title="No residents match"
              text="Try a different search or filter."
              action={<button className="btn-secondary" onClick={clearFilters}>Clear filters</button>}
            />
          ) : (
            <EmptyState
              icon={Users}
              title="No residents yet"
              text="Add your first resident and assign them to a room."
              action={<button className="btn-accent" onClick={() => setFormResident(null)}><Plus size={18} /> Add resident</button>}
            />
          )}
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
                    <th className="px-4 py-3 font-semibold">Joined</th>
                    <th className="px-4 py-3 font-semibold">Monthly rent</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {residents.map((r) => (
                    <tr key={r._id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <Link to={`/residents/${r._id}`} className="flex items-center gap-3">
                          <Avatar name={r.fullName} />
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-slate-900">{r.fullName}</span>
                            <span className="block text-xs text-slate-500">{r.phone}</span>
                            {r.email && <span className="block break-all text-xs text-slate-500">{r.email}</span>}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700">{r.room?.roomNumber || '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(r.joiningDate)}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{formatCurrency(r.monthlyRent)}</td>
                      <td className="px-4 py-3"><StatusBadge status={r.status} /><p className="mt-1 text-xs text-slate-500">{ACCOUNT_LABELS[r.accountStatus || 'unconfigured']}</p></td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Link to={`/residents/${r._id}`} className="btn-secondary min-h-10">View profile</Link>
                          {r.status === 'Active' && (
                            <IconButton icon={Pencil} label={`Edit ${r.fullName}`} onClick={() => setFormResident(r)} />
                          )}
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
            {residents.map((r) => (
              <li key={r._id} className="card flex items-center gap-3 p-3">
                <Link to={`/residents/${r._id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={r.fullName} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold text-slate-900">{r.fullName}</p>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="truncate text-xs text-slate-500">
                      Room {r.room?.roomNumber || '-'} · {r.phone}
                    </p>
                    {r.email && <p className="truncate text-xs text-slate-500">{r.email}</p>}
                    <p className="text-xs font-semibold text-slate-600">{ACCOUNT_LABELS[r.accountStatus || 'unconfigured']}</p>
                    <p className="truncate text-xs text-slate-500">
                      {formatCurrency(r.monthlyRent)}/month · Joined {formatDate(r.joiningDate)}
                    </p>
                  </div>
                  <ChevronRight size={18} className="shrink-0 text-slate-300" />
                </Link>
                {r.status === 'Active' && (
                  <IconButton icon={Pencil} label={`Edit ${r.fullName}`} onClick={() => setFormResident(r)} />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {formResident !== undefined && <ResidentFormModal resident={formResident} onClose={closeForm} onSaved={saved} />}
    </div>
  );
}
