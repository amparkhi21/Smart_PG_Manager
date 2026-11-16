import { useState } from 'react';
import toast from 'react-hot-toast';
import { BedDouble, DoorClosed, DoorOpen, Eye, Pencil, Plus, SearchX, Trash2 } from 'lucide-react';
import api from '../api/client.js';
import useFetch from '../hooks/useFetch.js';
import PageHeader from '../components/ui/PageHeader.jsx';
import SearchInput from '../components/ui/SearchInput.jsx';
import SegmentedControl from '../components/ui/SegmentedControl.jsx';
import StatCard from '../components/ui/StatCard.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import IconButton from '../components/ui/IconButton.jsx';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
import RoomFormModal from '../components/rooms/RoomFormModal.jsx';
import RoomDetailsModal from '../components/rooms/RoomDetailsModal.jsx';
import { formatCurrency, getErrorMessage } from '../utils/format.js';

export default function Rooms() {
  // The backend returns every room with its occupancy and status. Search and the
  // Occupied/Vacant filter just narrow that list on screen.
  const { data, loading, error, reload } = useFetch(async () => (await api.get('/rooms')).data.data, []);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [formRoom, setFormRoom] = useState(undefined); // undefined = closed, null = add, object = edit
  const [viewId, setViewId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const rooms = data || [];
  const counts = {
    total: rooms.length,
    occupied: rooms.filter((r) => r.status === 'Occupied').length,
    vacant: rooms.filter((r) => r.status === 'Vacant').length,
  };
  const term = search.trim().toLowerCase();
  const visible = rooms.filter(
    (r) => (filter === 'All' || r.status === filter) && r.roomNumber.toLowerCase().includes(term)
  );

  const closeForm = () => setFormRoom(undefined);
  const saved = () => {
    closeForm();
    reload();
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      const res = await api.delete(`/rooms/${deleteTarget._id}`);
      toast.success(res.data.message || 'Room deleted');
      reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <div>
      <PageHeader title="Rooms" subtitle="Manage rooms, rent and occupancy">
        <button className="btn-accent" onClick={() => setFormRoom(null)}>
          <Plus size={18} /> Add room
        </button>
      </PageHeader>

      <div className="mb-5 grid grid-cols-3 gap-2 sm:gap-3">
        <StatCard icon={BedDouble} label="Total" value={counts.total} tone="navy" loading={loading && !data} />
        <StatCard icon={DoorClosed} label="Occupied" value={counts.occupied} tone="teal" loading={loading && !data} />
        <StatCard icon={DoorOpen} label="Vacant" value={counts.vacant} tone="orange" loading={loading && !data} />
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by room number" className="sm:max-w-xs sm:flex-1" />
        <SegmentedControl options={['All', 'Occupied', 'Vacant']} value={filter} onChange={setFilter} />
      </div>

      {loading && !data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-44" />)}
        </div>
      ) : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : rooms.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={BedDouble}
            title="No rooms yet"
            text="Add your first room to start managing residents, rent and electricity."
            action={<button className="btn-accent" onClick={() => setFormRoom(null)}><Plus size={18} /> Add room</button>}
          />
        </div>
      ) : visible.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={SearchX}
            title="No rooms match"
            text="Try a different room number or filter."
            action={<button className="btn-secondary" onClick={() => { setSearch(''); setFilter('All'); }}>Clear filters</button>}
          />
        </div>
      ) : (
        <div className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-3 ${loading ? 'opacity-70' : ''}`}>
          {visible.map((room) => {
            const pct = room.capacity ? Math.min(100, (room.currentResidents / room.capacity) * 100) : 0;
            const occupied = room.currentResidents > 0;
            return (
              <article key={room._id} className="card flex flex-col gap-4 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-2xl font-extrabold text-slate-900">Room {room.roomNumber}</p>
                    <p className="text-sm text-slate-500">{room.floor ? `Floor ${room.floor}` : 'Floor not set'}</p>
                  </div>
                  <StatusBadge status={room.status} />
                </div>

                <div>
                  <p className="text-lg font-bold text-navy-900">
                    {formatCurrency(room.monthlyRent)} <span className="text-sm font-medium text-slate-400">/ month</span>
                  </p>
                </div>

                <div>
                  <div className="mb-1.5 flex justify-between text-xs font-medium text-slate-500">
                    <span>Occupancy</span>
                    <span>{room.currentResidents} / {room.capacity} beds</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>

                <div className="mt-auto flex gap-2">
                  <button className="btn-secondary min-h-10 flex-1" onClick={() => setViewId(room._id)}>
                    <Eye size={16} /> View
                  </button>
                  <IconButton icon={Pencil} label={`Edit room ${room.roomNumber}`} onClick={() => setFormRoom(room)} />
                  <IconButton
                    icon={Trash2}
                    tone="danger"
                    label={occupied ? 'Occupied rooms cannot be deleted' : `Delete room ${room.roomNumber}`}
                    disabled={occupied}
                    onClick={() => setDeleteTarget(room)}
                  />
                </div>
              </article>
            );
          })}
        </div>
      )}

      {formRoom !== undefined && <RoomFormModal room={formRoom} rooms={rooms} onClose={closeForm} onSaved={saved} />}

      {viewId && (
        <RoomDetailsModal
          roomId={viewId}
          onClose={() => setViewId(null)}
          onEdit={() => {
            const room = rooms.find((r) => r._id === viewId);
            setViewId(null);
            if (room) setFormRoom(room);
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={`Delete room ${deleteTarget.roomNumber}?`}
          message="This permanently removes the room. It only works for rooms with no residents and no rent or electricity history."
          confirmText="Delete room"
          loading={deleting}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}