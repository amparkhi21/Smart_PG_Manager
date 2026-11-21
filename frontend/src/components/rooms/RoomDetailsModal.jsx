import { Link } from 'react-router-dom';
import { Pencil, Users, Zap } from 'lucide-react';
import api from '../../api/client.js';
import useFetch from '../../hooks/useFetch.js';
import Modal from '../ui/Modal.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import ErrorState from '../ui/ErrorState.jsx';
import StatusBadge from '../ui/StatusBadge.jsx';
import { formatCurrency, formatDate, formatMonth } from '../../utils/format.js';

const Fact = ({ label, value }) => (
  <div className="rounded-xl bg-slate-50 p-3">
    <p className="text-xs font-medium text-slate-500">{label}</p>
    <p className="mt-0.5 truncate font-bold text-slate-900">{value}</p>
  </div>
);

export default function RoomDetailsModal({ roomId, onClose, onEdit }) {
  const { data: room, loading, error, reload } = useFetch(
    async () => (await api.get(`/rooms/${roomId}`)).data.data,
    [roomId]
  );

  return (
    <Modal title={room ? `Room ${room.roomNumber}` : 'Room details'} onClose={onClose}>
      {loading && !room && (
        <div className="space-y-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-28" />
        </div>
      )}
      {error && !room && <ErrorState message={error} onRetry={reload} />}

      {room && (
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <StatusBadge status={room.status} />
            <button type="button" onClick={onEdit} className="btn-secondary min-h-10">
              <Pencil size={16} /> Edit room
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Fact label="Monthly rent" value={formatCurrency(room.monthlyRent)} />
            <Fact label="Occupancy" value={`${room.residents.length} / ${room.capacity} beds`} />
            <Fact label="Floor" value={room.floor || '-'} />
            <Fact label="Room type" value={room.roomType || 'Not recorded'} />
            <Fact label="Air conditioning" value={room.airConditioning || 'Not recorded'} />
            <Fact label="Last meter reading" value={room.lastMeterReading} />
          </div>
          {room.notes && <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{room.notes}</p>}
          <section><h3 className="mb-2 font-bold text-slate-900">Amenities</h3><p className="break-words text-sm text-slate-600">{room.amenities?.length ? room.amenities.join(', ') : 'Not recorded'}</p></section>

          <section>
            <h3 className="mb-2 flex items-center gap-2 font-bold text-slate-900"><Users size={17} /> Residents</h3>
            {room.residents.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">
                No active residents in this room.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
                {room.residents.map((r) => (
                  <li key={r._id}>
                    <Link to={`/residents/${r._id}`} className="flex items-center justify-between gap-3 px-3 py-3 hover:bg-slate-50">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-800">{r.fullName}</p>
                        <p className="truncate text-xs text-slate-500">{r.phone} · Joined {formatDate(r.joiningDate)}</p>
                      </div>
                      <span className="shrink-0 text-sm font-bold text-slate-900">{formatCurrency(r.monthlyRent)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-2 flex items-center gap-2 font-bold text-slate-900"><Zap size={17} /> Recent electricity bills</h3>
            {room.recentBills.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">
                No electricity bills recorded for this room yet.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
                {room.recentBills.map((b) => (
                  <li key={b._id} className="flex items-center justify-between gap-3 px-3 py-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800">{formatMonth(b.month)}</p>
                      <p className="truncate text-xs text-slate-500">
                        {b.units} units × {formatCurrency(b.ratePerUnit)} · {b.previousReading} → {b.currentReading}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="font-bold text-slate-900">{formatCurrency(b.amount)}</span>
                      <StatusBadge status={b.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
