import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, SearchX, BedDouble } from 'lucide-react';
import api from '../api/client.js';
import useFetch from '../hooks/useFetch.js';
import useDebounce from '../hooks/useDebounce.js';
import PageHeader from '../components/ui/PageHeader.jsx';
import SearchInput from '../components/ui/SearchInput.jsx';
import { Select } from '../components/ui/FormControls.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import ResidentRoomCard from '../components/rooms/ResidentRoomCard.jsx';
import RoomChangeRequestModal from '../components/rooms/RoomChangeRequestModal.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function ResidentRoomAvailability() {
  const navigate = useNavigate();
  const { resident } = useAuth();
  const [requestRoom, setRequestRoom] = useState(null);
  const [search, setSearch] = useState('');
  const [floor, setFloor] = useState('');
  const [roomType, setRoomType] = useState('');
  const [availability, setAvailability] = useState('');
  const q = useDebounce(search);
  const { data, loading, error, reload } = useFetch(async () => {
    const params = {};
    if (q.trim()) params.search = q.trim();
    if (floor) params.floor = floor;
    if (roomType) params.roomType = roomType;
    if (availability) params.availability = availability;
    return (await api.get('/resident/rooms', { params })).data.data;
  }, [q, floor, roomType, availability]);
  const filtered = Boolean(q.trim() || floor || roomType || availability);
  const clearFilters = () => { setSearch(''); setFloor(''); setRoomType(''); setAvailability(''); };
  return <div>
    <PageHeader title="Room Availability" subtitle="Explore rooms and available beds in your PG.">
      <button type="button" className="btn-secondary" onClick={reload} disabled={loading}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh availability</button>
    </PageHeader>
    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SearchInput value={search} onChange={setSearch} placeholder="Search rooms, floors or types" />
      <Select aria-label="Filter rooms by floor" value={floor} onChange={(event) => setFloor(event.target.value)}><option value="">All floors</option>{(data?.filters.floors || []).map((value) => <option key={value} value={value}>{value}</option>)}</Select>
      <Select aria-label="Filter rooms by type" value={roomType} onChange={(event) => setRoomType(event.target.value)}><option value="">All room types</option>{(data?.filters.roomTypes || []).map((value) => <option key={value} value={value}>{value}</option>)}</Select>
      <Select aria-label="Filter rooms by availability" value={availability} onChange={(event) => setAvailability(event.target.value)}><option value="">All availability</option>{['Vacant', 'Partially Occupied', 'Full'].map((value) => <option key={value} value={value}>{value}</option>)}</Select>
    </div>
    {error ? <ErrorState message={error} onRetry={reload} /> : !data ? <div role="status" aria-label="Loading rooms" className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-96" /><Skeleton className="h-96" /></div>
      : data.rooms.length === 0 ? <div className="card"><EmptyState icon={filtered ? SearchX : BedDouble} title={filtered ? 'No rooms match' : 'No rooms listed'} text={filtered ? 'Try a different search or filter.' : 'Your PG owner has not listed rooms yet.'}
        action={filtered ? <button type="button" className="btn-secondary" onClick={clearFilters}>Clear filters</button> : undefined} /></div>
        : <div aria-busy={loading}><p className="mb-3 text-sm text-slate-500">{data.rooms.length} room{data.rooms.length === 1 ? '' : 's'} shown · Occupancy includes all active residents.</p><div className="grid gap-4 lg:grid-cols-2">{data.rooms.map((room) => <ResidentRoomCard key={room.id} room={room} onRequest={room.availableBeds > 0 && room.id !== (data.currentRoomId || resident?.room?.id) ? setRequestRoom : undefined} />)}</div></div>}
    {requestRoom && <RoomChangeRequestModal initialRoom={requestRoom} onClose={() => setRequestRoom(null)} onSaved={() => { setRequestRoom(null); navigate('/resident/room-change-requests'); }} />}
  </div>;
}
