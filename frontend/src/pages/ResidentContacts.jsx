import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Pencil, Phone, RefreshCw, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client.js';
import useFetch from '../hooks/useFetch.js';
import PageHeader from '../components/ui/PageHeader.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { Field, Input } from '../components/ui/FormControls.jsx';
import ResidentFormModal from '../components/residents/ResidentFormModal.jsx';
import { copyText } from '../native/external.js';

const compactPhone = (value = '') => value.replace(/[\s().-]/g, '');

function ContactPhone({ number, label }) {
  if (!number) return <span className="text-slate-400">Not provided</span>;
  const phone = compactPhone(number);
  const copy = async () => {
    try { await copyText(number); toast.success('Phone number copied'); }
    catch { toast.error('Could not copy the phone number. Select and copy it manually.'); }
  };
  return <div className="flex min-w-0 flex-wrap items-center gap-1">
    <a href={`tel:${phone}`} aria-label={`Call ${label}: ${number}`} className="inline-flex min-h-11 items-center gap-2 break-all text-teal-700 underline"><Phone size={15} className="shrink-0" />{number}</a>
    <button type="button" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100" aria-label={`Copy ${label}: ${number}`} onClick={copy}><Copy size={16} /></button>
  </div>;
}

export default function ResidentContacts() {
  const [search, setSearch] = useState(''), [editing, setEditing] = useState(null);
  const { data, loading, error, reload } = useFetch(async () => (await api.get('/residents')).data.data, []);
  const term = search.trim().toLowerCase(), phoneTerm = compactPhone(term);
  const residents = [...new Map((data || []).map((resident) => [resident._id, resident])).values()].filter((resident) =>
    !term || [resident.fullName, resident.room?.roomNumber].some((value) => String(value || '').toLowerCase().includes(term))
    || (phoneTerm && [resident.phone, resident.emergencyContact?.phone].some((value) => value && compactPhone(value).includes(phoneTerm))));
  return <div>
    <PageHeader title="Resident Contacts" subtitle="Resident and parent contact details for your PG.">
      <button type="button" className="btn-secondary" disabled={loading} onClick={reload}><RefreshCw size={16} />Refresh</button>
    </PageHeader>
    <div className="mb-5 max-w-lg"><Field label="Search resident contacts" htmlFor="contact-search"><Input id="contact-search" type="search" value={search} maxLength={100} onChange={(event) => setSearch(event.target.value)} placeholder="Search by resident name, phone or room number" /></Field></div>
    {error ? <ErrorState message={error} onRetry={reload} /> : loading ? <div role="status" aria-label="Loading resident contacts"><Skeleton className="h-64" /></div>
      : !residents.length ? <div className="card"><EmptyState icon={Users} title={search ? 'No matching residents' : 'No resident contacts yet'} text={search ? 'Try another name, phone number or room.' : 'Add residents to see their contact details here.'} /></div>
        : <div className="card overflow-hidden">
          <div aria-hidden="true" className="hidden grid-cols-[1.1fr_1fr_1fr_1fr_auto] gap-4 bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-600 xl:grid"><span>Resident / room</span><span>Personal phone</span><span>Email address</span><span>Parent's phone</span><span>Edit</span></div>
          <ul aria-label="Resident contacts" className="divide-y divide-slate-100">{residents.map((resident) => <li key={resident._id} className="grid min-w-0 items-start gap-3 p-5 sm:grid-cols-2 xl:grid-cols-[1.1fr_1fr_1fr_1fr_auto] xl:gap-4">
            <div className="min-w-0"><Link to={`/residents/${resident._id}`} className="break-words font-bold text-navy-900 hover:underline">{resident.fullName}</Link><p className="mt-1 text-sm text-slate-500">Room {resident.room?.roomNumber || 'Not assigned'} · {resident.status}</p></div>
            <div className="min-w-0"><p className="text-sm text-slate-500 xl:sr-only">Personal phone</p><ContactPhone number={resident.phone} label={`${resident.fullName}'s personal phone`} /></div>
            <div className="min-w-0"><p className="text-sm text-slate-500 xl:sr-only">Email address</p>{resident.email ? <a className="inline-flex min-h-11 items-center break-all text-teal-700 underline" href={`mailto:${resident.email}`}>{resident.email}</a> : <p className="py-3 text-slate-400">Not provided</p>}</div>
            <div className="min-w-0"><p className="text-sm text-slate-500 xl:sr-only">Parent's phone (emergency contact)</p><ContactPhone number={resident.emergencyContact?.phone} label={`${resident.fullName}'s parent phone`} /></div>
            {resident.status === 'Active' ? <button type="button" className="btn-secondary justify-self-start" aria-label={`Edit ${resident.fullName}`} onClick={() => setEditing(resident)}><Pencil size={16} /><span className="xl:sr-only">Edit</span></button> : <span className="text-sm text-slate-400">Left</span>}
          </li>)}</ul>
        </div>}
    {editing && <ResidentFormModal resident={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
  </div>;
}
