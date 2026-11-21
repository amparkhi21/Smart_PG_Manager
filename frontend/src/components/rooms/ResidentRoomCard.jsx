import { BedDouble } from 'lucide-react';
import StatusBadge from '../ui/StatusBadge.jsx';
import { formatCurrency } from '../../utils/format.js';

export default function ResidentRoomCard({ room, onRequest }) {
  const facts = [
    ['Floor', room.floor || 'Not recorded'], ['Room type', room.roomType || 'Not recorded'],
    ['Air conditioning', room.airConditioning || 'Not recorded'], ['Sharing capacity', `${room.capacity} beds`],
    ['Room monthly rent', formatCurrency(room.monthlyRent)],
    ...(room.assignedMonthlyRent !== undefined ? [['Your monthly rent', formatCurrency(room.assignedMonthlyRent)]] : []),
    ['Occupied beds', room.occupiedBeds], ['Available beds', room.availableBeds],
  ];
  return <article className="card min-w-0 p-5 sm:p-6" aria-label={`Room ${room.roomNumber}`}>
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><BedDouble size={23} /></span>
        <h2 className="break-words text-xl font-extrabold text-navy-900">Room {room.roomNumber}</h2></div>
      <StatusBadge status={room.status} />
    </div>
    <dl className="grid grid-cols-2 gap-4">{facts.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-sm text-slate-500">{label}</dt><dd className="mt-1 break-words font-semibold text-navy-900">{value}</dd></div>)}</dl>
    <section className="mt-5 border-t border-slate-100 pt-4"><h3 className="mb-2 text-sm font-bold text-navy-900">Available amenities</h3>
      {room.amenities.length > 0 ? <ul className="flex flex-wrap gap-2">{room.amenities.map((amenity, index) => <li key={`${amenity}-${index}`} className="max-w-full break-words rounded-lg bg-slate-50 px-3 py-1.5 text-sm text-slate-700">{amenity}</li>)}</ul>
        : <p className="text-sm text-slate-500">Not recorded</p>}
    </section>
    {onRequest && <button type="button" className="btn-primary mt-5 w-full" onClick={() => onRequest(room)}>Request Room Change</button>}
  </article>;
}
