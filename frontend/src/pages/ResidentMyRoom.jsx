import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import api from '../api/client.js';
import useFetch from '../hooks/useFetch.js';
import PageHeader from '../components/ui/PageHeader.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import ResidentRoomCard from '../components/rooms/ResidentRoomCard.jsx';

export default function ResidentMyRoom() {
  const { data, loading, error, reload } = useFetch(async () => (await api.get('/resident/my-room')).data.data, []);
  return <div>
    <PageHeader title="My Room" subtitle="Your assigned room and its current availability.">
      <Link to="/resident/rooms" className="btn-secondary">Browse rooms</Link>
      <button type="button" className="btn-secondary" onClick={reload} disabled={loading}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh room</button>
    </PageHeader>
    {error ? <ErrorState message={error} onRetry={reload} /> : !data ? <div role="status" aria-label="Loading your room"><Skeleton className="h-96" /></div>
      : <div className="max-w-3xl" aria-busy={loading}><ResidentRoomCard room={data.room} /><p className="mt-4 text-sm text-slate-500">Contact your PG owner if room details or amenities need updating.</p></div>}
  </div>;
}
