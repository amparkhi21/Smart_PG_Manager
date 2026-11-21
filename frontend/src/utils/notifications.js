const ID = /^[a-f\d]{24}$/i;
const targets = {
  complaint_created: ['owner', '/complaints', 'complaint', 'Complaint Management'],
  complaint_status_updated: ['resident', '/resident/complaints', 'complaint', 'My Complaints'],
  complaint_response: ['resident', '/resident/complaints', 'complaint', 'My Complaints'],
  room_change_requested: ['owner', '/room-change-requests', 'room', 'Room Change Requests'],
  room_change_approved: ['resident', '/resident/room-change-requests', 'room', 'Room Change Requests'],
  room_change_rejected: ['resident', '/resident/room-change-requests', 'room', 'Room Change Requests'],
  leave_requested: ['owner', '/leave-requests', 'leave', 'Leave Management'],
  leave_approved: ['resident', '/resident/leave-requests', 'leave', 'Leave Requests'],
  leave_rejected: ['resident', '/resident/leave-requests', 'leave', 'Leave Requests'],
  payment_claim_submitted: ['owner', '/payment-requests', 'payment', 'Payment Requests'],
  payment_approved: ['resident', '/resident/payments', 'payment', 'My Bills & Payments'],
  payment_rejected: ['resident', '/resident/payments', 'payment', 'My Bills & Payments'],
  notice_published: ['resident', '/resident/notices', 'notice', 'Notice Board'],
  rent_due: ['resident', '/resident/payments', 'bill', 'My Bills & Payments'],
  bill_due: ['resident', '/resident/payments', 'bill', 'My Bills & Payments'],
};

export function notificationIdentity(owner, resident) {
  const role = owner ? 'owner' : 'resident', user = owner || resident;
  const id = String(user?.id || user?._id || '').toLowerCase();
  const pgId = owner ? id : String(resident?.pgId || /^PG-([a-f\d]{24})$/i.exec(resident?.pgCode || '')?.[1] || '').toLowerCase();
  return { id, pgId, role, key: `${role}:${pgId}:${id}`, enabled: Boolean(ID.test(id) && ID.test(pgId) && !resident?.passwordChangeRequired) };
}
export function belongsToNotificationAccount(item, identity) {
  return item?.recipientRole === identity.role && String(item.recipientId).toLowerCase() === identity.id && String(item.pgId).toLowerCase() === identity.pgId;
}
export function notificationTarget(item, role) {
  if (!Object.hasOwn(targets, item?.type)) return null;
  const [allowedRole, path, kind, label] = targets[item.type];
  // Exact application paths only: reject schemes, other roles, queries, escapes and fragments.
  if (role !== allowedRole || item.path !== path || !ID.test(item.relatedEntityId || '')) return null;
  return { path, kind, label, id: item.relatedEntityId };
}
export const notificationTypeLabel = (type) => typeof type === 'string' ? type.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase()) : 'Update';
export const notificationBadge = (count) => count > 99 ? '99+' : String(count);
export function notificationPage(data, identity) {
  if (!Array.isArray(data?.notifications) || data.notifications.some((item) => !ID.test(item.id || '') || !belongsToNotificationAccount(item, identity)
    || typeof item.title !== 'string' || typeof item.message !== 'string' || !Number.isFinite(Date.parse(item.createdAt)))
    || !Number.isInteger(data.pagination?.page) || data.pagination.page < 1 || !Number.isInteger(data.pagination.totalPages) || data.pagination.totalPages < 0) {
    throw new Error('Notifications could not be verified for this account. Please refresh.');
  }
  return { ...data, notifications: [...data.notifications].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt) || b.id.localeCompare(a.id)) };
}

// These are existing scoped APIs. Older records outside their supported history stay unavailable.
export async function fetchNotificationRecord(api, item, role, signal) {
  const target = notificationTarget(item, role);
  if (!target) throw new Error('This notification does not have an available application link.');
  const base = role === 'owner' ? '' : '/resident';
  const get = async (path, params) => (await api.get(path, { params, signal })).data.data;
  let record;
  if (target.kind === 'complaint' || target.kind === 'leave') {
    record = await get(`${base}/${target.kind === 'complaint' ? 'complaints' : 'leave-requests'}/${target.id}`);
  } else {
    let rows;
    if (target.kind === 'room') rows = (await get(`${base}/room-change-requests`)).requests;
    if (target.kind === 'payment') rows = await get(role === 'owner' ? '/payment-claims' : '/resident/payments/claims', role === 'owner' ? { limit: 100 } : undefined);
    if (target.kind === 'notice') rows = (await get('/community/notices')).notices;
    if (target.kind === 'bill') {
      rows = await get('/resident/payments/bills');
      if (!rows.some((row) => row.id === target.id)) rows = await get('/resident/payments/history');
      rows = rows.filter((row) => row.billType === (item.type === 'rent_due' ? 'Rent' : 'Electricity'));
    }
    record = rows?.find((row) => row.id === target.id);
  }
  if (!record || record.id !== target.id) throw new Error('This related item is no longer available in this view.');
  return { target, record };
}
