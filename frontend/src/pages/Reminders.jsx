import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, Clock3, MessageCircle, SearchX, Users, Wallet, Zap } from 'lucide-react';
import api from '../api/client.js';
import useFetch from '../hooks/useFetch.js';
import { useAuth } from '../context/AuthContext.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import StatCard from '../components/ui/StatCard.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import SearchInput from '../components/ui/SearchInput.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import Modal from '../components/ui/Modal.jsx';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
import MonthYearPicker from '../components/ui/MonthYearPicker.jsx';
import { Select } from '../components/ui/FormControls.jsx';
import ReminderPreviewModal from '../components/reminders/ReminderPreviewModal.jsx';
import { currentMonth, formatCurrency, formatDateTime, formatMonth, getErrorMessage, round2 } from '../utils/format.js';
import { filterOutstandingRecords, normalizeWhatsAppPhone } from '../utils/reminders.js';

const compareByRoom = (a, b) =>
  (a.room.roomNumber || '').localeCompare(b.room.roomNumber || '', undefined, { numeric: true }) ||
  (a.residents[0]?.fullName || '').localeCompare(b.residents[0]?.fullName || '');

export default function Reminders() {
  const { owner: sessionOwner } = useAuth();
  const [month, setMonth] = useState(currentMonth());
  const [search, setSearch] = useState('');
  const [roomFilter, setRoomFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [overdueFilter, setOverdueFilter] = useState('');
  const [previewItem, setPreviewItem] = useState(null);
  const [previewActivity, setPreviewActivity] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkSelection, setBulkSelection] = useState([]);
  const [bulkPrepared, setBulkPrepared] = useState([]);
  const [bulkBusy, setBulkBusy] = useState(false);

  const { data: dashboard, loading, error, reload } = useFetch(async () => {
    const [rent, electricity, residents, rooms, settings] = await Promise.all([
      api.get('/rent'),
      api.get('/electricity'),
      api.get('/residents', { params: { status: 'Active' } }),
      api.get('/rooms'),
      api.get('/settings'),
    ]);
    return {
      rents: rent.data.data,
      bills: electricity.data.data,
      residents: residents.data.data,
      rooms: rooms.data.data,
      owner: settings.data.data.owner,
    };
  }, []);

  const { data: activities, loading: activityLoading, error: activityError, reload: reloadActivities } = useFetch(
    async () => (await api.get('/reminders/activity')).data.data,
    []
  );

  const effectiveOwner = dashboard?.owner || sessionOwner || {};
  const suggestionsEnabled = effectiveOwner.reminderSettings?.suggestionsEnabled !== false;
  const sourceData = dashboard || { rents: [], bills: [], residents: [], rooms: [] };
  const activeByRoom = useMemo(() => {
    const map = new Map();
    sourceData.residents.forEach((resident) => {
      const roomId = resident.room?._id || resident.room;
      if (!roomId) return;
      if (!map.has(roomId)) map.set(roomId, []);
      map.get(roomId).push(resident);
    });
    return map;
  }, [sourceData.residents]);

  const outstandingRecords = useMemo(
    () => filterOutstandingRecords(sourceData.rents, sourceData.bills, month),
    [month, sourceData.bills, sourceData.rents]
  );

  const pendingItems = useMemo(() => {
    const rentItems = outstandingRecords.rents.map((bill) => ({
        key: `Rent-${bill._id}`,
        sourceType: 'Rent',
        bill,
        room: bill.room || { roomNumber: '-' },
        residents: bill.resident ? [bill.resident] : [],
      }));
    const electricityItems = outstandingRecords.electricity.map((bill) => ({
        key: `Electricity-${bill._id}`,
        sourceType: 'Electricity',
        bill,
        room: bill.room || { roomNumber: '-' },
        residents: activeByRoom.get(bill.room?._id) || [],
      }));
    return [...rentItems, ...electricityItems].sort(compareByRoom);
  }, [activeByRoom, outstandingRecords]);

  const rentPending = pendingItems.filter((item) => item.sourceType === 'Rent');
  const electricityPending = pendingItems.filter((item) => item.sourceType === 'Electricity');
  const overdueItems = pendingItems.filter((item) => item.bill.status === 'Overdue');
  const pendingRentTotal = round2(rentPending.reduce((sum, item) => sum + item.bill.balance, 0));
  const outstandingElectricityTotal = round2(electricityPending.reduce((sum, item) => sum + item.bill.balance, 0));
  const residentsWithPendingRent = new Set(rentPending.map((item) => item.bill.resident?._id).filter(Boolean)).size;

  const term = search.trim().toLowerCase();
  const shown = pendingItems.filter((item) => {
    const names = item.residents.map((resident) => resident.fullName).join(' ').toLowerCase();
    const roomNo = String(item.room.roomNumber || '').toLowerCase();
    return (
      (!term || `${names} ${roomNo}`.includes(term)) &&
      (!roomFilter || item.room?._id === roomFilter) &&
      (!typeFilter || item.sourceType === typeFilter) &&
      (!overdueFilter || (overdueFilter === 'Overdue' ? item.bill.status === 'Overdue' : item.bill.status !== 'Overdue'))
    );
  });

  const eligibleRecipients = useMemo(
    () =>
      pendingItems.flatMap((item) =>
        item.residents
          .filter((resident) => resident.status !== 'Left' && normalizeWhatsAppPhone(resident.phone))
          .map((resident) => ({ ...item, residents: [resident], selectionKey: `${item.sourceType}-${item.bill._id}-${resident._id}` }))
      ),
    [pendingItems]
  );

  const filtersActive = Boolean(term || roomFilter || typeFilter || overdueFilter);
  const clearFilters = () => {
    setSearch('');
    setRoomFilter('');
    setTypeFilter('');
    setOverdueFilter('');
  };

  const openPreview = (item, activity = null) => {
    setPreviewActivity(activity);
    setPreviewItem(item);
  };

  const onActivitySaved = () => {
    reloadActivities();
  };

  const toggleBulkSelection = (key) => {
    setBulkSelection((current) => current.includes(key) ? current.filter((value) => value !== key) : [...current, key]);
  };

  const prepareBulk = async () => {
    if (bulkBusy || bulkSelection.length === 0) return;
    setBulkBusy(true);
    setBulkConfirm(false);
    const selected = eligibleRecipients.filter((item) => bulkSelection.includes(item.selectionKey));
    const prepared = [];
    try {
      for (const item of selected) {
        const { data } = await api.post('/reminders/activity', {
          sourceType: item.sourceType,
          sourceId: item.bill._id,
          recipientId: item.residents[0]._id,
        });
        prepared.push({ item, activity: data.data });
      }
      setBulkPrepared(prepared);
      setBulkSelection([]);
      reloadActivities();
      toast.success(`${prepared.length} reminder preview${prepared.length === 1 ? '' : 's'} prepared. Nothing was sent.`);
    } catch (err) {
      setBulkPrepared(prepared);
      toast.error(`Could not prepare all reminders: ${getErrorMessage(err)}`);
    } finally {
      setBulkBusy(false);
    }
  };

  const activitiesForHistory = (activities || [])
    .filter((activity) =>
      activity.billingMonth === month &&
      (!typeFilter || activity.sourceType === typeFilter) &&
      (!overdueFilter || (overdueFilter === 'Overdue' ? activity.reminderType.startsWith('Overdue') : !activity.reminderType.startsWith('Overdue'))) &&
      (!roomFilter || sourceData.rooms.find((room) => room.roomNumber === activity.roomNumber)?._id === roomFilter) &&
      (!term || `${activity.recipientName} ${activity.roomNumber} ${activity.reminderType}`.toLowerCase().includes(term))
    )
    .slice(0, 12);

  return (
    <div>
      <PageHeader title="WhatsApp Reminders" subtitle={`Outstanding payment reminders · ${formatMonth(month)}`}>
        <MonthYearPicker value={month} onChange={setMonth} />
        <button className="btn-primary" disabled={!suggestionsEnabled} onClick={() => { setBulkPrepared([]); setBulkOpen(true); }}>
          <MessageCircle size={18} /> Prepare Bulk Reminders
        </button>
      </PageHeader>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Users} label="Residents with pending rent" value={residentsWithPendingRent} tone="navy" loading={loading} />
        <StatCard icon={Wallet} label="Outstanding rent" value={formatCurrency(pendingRentTotal)} tone="orange" loading={loading} />
        <StatCard icon={Zap} label="Outstanding electricity" value={formatCurrency(outstandingElectricityTotal)} tone="teal" loading={loading} />
        <StatCard icon={AlertTriangle} label="Overdue records" value={overdueItems.length} tone="rose" loading={loading} />
      </div>

      {!suggestionsEnabled && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Reminder suggestions are disabled in settings. Outstanding records are still shown for review; no messages will be sent automatically.
        </div>
      )}

      <div className="mb-4 space-y-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search resident or room" />
        <div className="grid grid-cols-2 gap-3 md:flex md:items-center">
          <Select value={roomFilter} onChange={(event) => setRoomFilter(event.target.value)} aria-label="Filter by room" className="md:w-48">
            <option value="">All rooms</option>
            {(sourceData.rooms || []).map((room) => <option key={room._id} value={room._id}>Room {room.roomNumber}</option>)}
          </Select>
          <Select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Filter by reminder type" className="md:w-52">
            <option value="">All reminder types</option>
            <option value="Rent">Rent</option>
            <option value="Electricity">Electricity</option>
          </Select>
          <Select value={overdueFilter} onChange={(event) => setOverdueFilter(event.target.value)} aria-label="Filter by overdue status" className="md:w-48">
            <option value="">All due statuses</option>
            <option value="Overdue">Overdue</option>
            <option value="Not overdue">Not overdue</option>
          </Select>
          {filtersActive && <button className="btn-secondary col-span-2 md:col-span-1" onClick={clearFilters}>Clear filters</button>}
        </div>
      </div>

      {loading && !dashboard ? (
        <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-72" /></div>
      ) : error && !dashboard ? (
        <ErrorState message={error} onRetry={reload} />
      ) : shown.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={SearchX}
            title={`No outstanding records for ${formatMonth(month)}`}
            text={filtersActive ? 'No records match these filters.' : 'All listed rent and electricity bills are paid for this month.'}
            action={filtersActive ? <button className="btn-secondary" onClick={clearFilters}>Clear filters</button> : null}
          />
        </div>
      ) : (
        <>
          <div className="card hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Resident / room</th>
                    <th className="px-4 py-3 font-semibold">Type / billing month</th>
                    <th className="px-4 py-3 text-right font-semibold">Billed</th>
                    <th className="px-4 py-3 text-right font-semibold">Paid</th>
                    <th className="px-4 py-3 text-right font-semibold">Balance</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shown.map((item) => {
                    const isRent = item.sourceType === 'Rent';
                    const bill = item.bill;
                    const resident = isRent ? bill.resident : null;
                    const canRemind = suggestionsEnabled && (isRent
                      ? resident?.status === 'Active' && normalizeWhatsAppPhone(resident.phone)
                      : item.residents.some((candidate) => normalizeWhatsAppPhone(candidate.phone)));
                    const value = isRent ? bill.amountDue : bill.amount;
                    return (
                      <tr key={item.key}>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">
                            {isRent ? resident?.fullName || 'Former resident' : item.residents.length ? `${item.residents.length} current resident${item.residents.length === 1 ? '' : 's'}` : 'No current resident'}
                          </p>
                          <p className="text-xs text-slate-500">Room {item.room.roomNumber}{isRent && resident?.status === 'Left' ? ' · Former resident' : ''}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{item.sourceType}<p className="text-xs text-slate-500">{formatMonth(bill.month)}</p></td>
                        <td className="px-4 py-3 text-right text-slate-700">{formatCurrency(value)}</td>
                        <td className="px-4 py-3 text-right text-emerald-700">{formatCurrency(bill.amountPaid)}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900">{formatCurrency(bill.balance)}</td>
                        <td className="px-4 py-3"><StatusBadge status={bill.status} /></td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            className="btn-secondary min-h-10"
                            disabled={!canRemind}
                            onClick={() => openPreview(item)}
                            title={!canRemind ? 'No eligible active recipient with a valid phone number' : 'Prepare a WhatsApp reminder'}
                          >
                            <MessageCircle size={16} /> {isRent ? 'Prepare reminder' : 'Choose recipient'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <ul className="space-y-3 md:hidden">
            {shown.map((item) => {
              const isRent = item.sourceType === 'Rent';
              const bill = item.bill;
              const resident = isRent ? bill.resident : null;
              const canRemind = suggestionsEnabled && (isRent
                ? resident?.status === 'Active' && normalizeWhatsAppPhone(resident.phone)
                : item.residents.some((candidate) => normalizeWhatsAppPhone(candidate.phone)));
              return (
                <li key={item.key} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{isRent ? resident?.fullName || 'Former resident' : `${item.residents.length} eligible resident${item.residents.length === 1 ? '' : 's'}`}</p>
                      <p className="text-xs text-slate-500">Room {item.room.roomNumber} · {item.sourceType} · {formatMonth(bill.month)}</p>
                    </div>
                    <StatusBadge status={bill.status} />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-xl bg-slate-50 py-2"><p className="text-sm font-bold text-slate-800">{formatCurrency(isRent ? bill.amountDue : bill.amount)}</p>Billed</div>
                    <div className="rounded-xl bg-emerald-50 py-2"><p className="text-sm font-bold text-emerald-700">{formatCurrency(bill.amountPaid)}</p>Paid</div>
                    <div className="rounded-xl bg-orange-50 py-2"><p className="text-sm font-bold text-orange-700">{formatCurrency(bill.balance)}</p>Due</div>
                  </div>
                  <button type="button" className="btn-secondary mt-3 w-full" disabled={!canRemind} onClick={() => openPreview(item)}>
                    <MessageCircle size={16} /> {isRent ? 'Prepare reminder' : 'Choose recipient'}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Recent reminder activity</h2>
            <p className="text-sm text-slate-500">Owner-scoped history. Opening WhatsApp does not mean a message was sent or delivered.</p>
          </div>
          <button type="button" className="btn-secondary min-h-9 px-3 text-xs" onClick={reloadActivities}>Refresh</button>
        </div>
        {activityLoading && !activities ? (
          <div className="space-y-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
        ) : activityError && !activities ? (
          <ErrorState message={activityError} onRetry={reloadActivities} />
        ) : activitiesForHistory.length === 0 ? (
          <div className="card">
            <EmptyState icon={Clock3} title="No reminder activity for this month" text="Prepared reminders and WhatsApp opens will appear here. No message is sent automatically." />
          </div>
        ) : (
          <ul className="space-y-2">
            {activitiesForHistory.map((activity, index) => (
              <li key={`${activity._id}-${activity.eventAt}-${index}`} className="card flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{activity.recipientName} · Room {activity.roomNumber}</p>
                  <p className="truncate text-xs text-slate-500">{activity.reminderType} · {formatMonth(activity.billingMonth)} · Bill #{String(activity.sourceId).slice(-6)} · {activity.phone}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-xs text-slate-500">{formatDateTime(activity.eventAt)} · {activity.ownerName}</span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${activity.status === 'Owner-reported sent' ? 'bg-sky-50 text-sky-700' : activity.status === 'WhatsApp opened' ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-600'}`}>
                    {activity.status}
                  </span>
                  {activity.status === 'Owner-reported sent' && <span className="text-[11px] text-slate-400">Not provider-verified</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {previewItem && effectiveOwner && (
        <ReminderPreviewModal
          key={`${previewItem.sourceType}-${previewItem.bill._id}-${previewActivity?._id || 'new'}`}
          item={previewItem}
          owner={effectiveOwner}
          initialActivity={previewActivity}
          onClose={() => { setPreviewItem(null); setPreviewActivity(null); }}
          onActivitySaved={onActivitySaved}
        />
      )}

      {bulkOpen && (
        <Modal title="Prepare bulk reminders" onClose={() => setBulkOpen(false)} size="lg" dismissable={!bulkBusy}>
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-slate-600">Select eligible bill-and-recipient pairs. This only creates reminder drafts; each message must be reviewed and opened individually, then manually sent in WhatsApp.</p>
            {eligibleRecipients.length === 0 ? (
              <EmptyState icon={Users} title="No eligible recipients" text="There are no unpaid records for this month with an active resident and valid phone number." />
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-slate-500">{eligibleRecipients.length} eligible reminder{eligibleRecipients.length === 1 ? '' : 's'}</span>
                  <button
                    type="button"
                    className="font-semibold text-teal-700"
                    onClick={() => setBulkSelection(bulkSelection.length === eligibleRecipients.length ? [] : eligibleRecipients.map((item) => item.selectionKey))}
                  >
                    {bulkSelection.length === eligibleRecipients.length ? 'Clear selection' : 'Select all'}
                  </button>
                </div>
                <ul className="max-h-[45dvh] space-y-2 overflow-y-auto">
                  {eligibleRecipients.map((item) => {
                    const resident = item.residents[0];
                    return (
                      <li key={item.selectionKey} className="rounded-xl border border-slate-100 p-3">
                        <label className="flex cursor-pointer items-start gap-3">
                          <input
                            type="checkbox"
                            checked={bulkSelection.includes(item.selectionKey)}
                            onChange={() => toggleBulkSelection(item.selectionKey)}
                            className="mt-1 h-4 w-4 accent-teal-600"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold text-slate-900">{resident.fullName} · Room {item.room.roomNumber}</span>
                            <span className="block text-xs text-slate-500">{item.sourceType} · {formatMonth(item.bill.month)} · {item.bill.status}</span>
                          </span>
                          <span className="shrink-0 font-bold text-orange-700">{formatCurrency(item.bill.balance)}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <div className="flex gap-3">
                  <button type="button" className="btn-secondary flex-1" onClick={() => setBulkOpen(false)}>Close</button>
                  <button type="button" className="btn-primary flex-1" disabled={!bulkSelection.length || bulkBusy} onClick={() => setBulkConfirm(true)}>
                    Prepare {bulkSelection.length || ''} draft{bulkSelection.length === 1 ? '' : 's'}
                  </button>
                </div>
              </>
            )}

            {bulkPrepared.length > 0 && (
              <div className="border-t border-slate-100 pt-4">
                <h3 className="mb-2 font-bold text-slate-900">Prepared drafts — open one at a time</h3>
                <ul className="space-y-2">
                  {bulkPrepared.map(({ item, activity }) => (
                    <li key={`${item.selectionKey}-${activity._id}`} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
                      <span className="min-w-0 truncate text-sm font-medium text-slate-800">{item.residents[0].fullName} · Room {item.room.roomNumber} · {item.sourceType}</span>
                      <button type="button" className="btn-secondary min-h-9 shrink-0 px-3 text-xs" onClick={() => { setBulkOpen(false); openPreview(item, activity); }}>
                        Open preview
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Modal>
      )}

      {bulkConfirm && (
        <ConfirmDialog
          title={`Prepare ${bulkSelection.length} reminder drafts?`}
          message="This creates owner-scoped draft activity only. No WhatsApp messages will be sent or opened. Each draft can be reviewed and opened individually."
          confirmText={bulkBusy ? 'Preparing...' : 'Prepare drafts'}
          loading={bulkBusy}
          tone="warning"
          onConfirm={prepareBulk}
          onCancel={() => setBulkConfirm(false)}
        />
      )}
    </div>
  );
}
