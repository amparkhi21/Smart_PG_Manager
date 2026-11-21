export const LEAVE_STATUSES = ['Pending', 'Approved', 'Rejected', 'Cancelled'];
export const LEAVE_PAGE_SIZE = 20;
export const normalizeEmergencyContact = (value) => value.trim().replace(/[\s()-]/g, '');
const realDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
export const leaveDuration = (from, to) => realDate(from) && realDate(to) && to >= from ? (new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000 + 1 : null;
export function leaveErrors(form, today) {
  const errors = {};
  if (!realDate(form.fromDate) || form.fromDate < today) errors.fromDate = 'Choose today or a future date in India.';
  if (!realDate(form.toDate) || form.toDate < form.fromDate) errors.toDate = 'Choose an end date on or after the start date.';
  else if (leaveDuration(form.fromDate, form.toDate) > 365) errors.toDate = 'A leave request can cover at most 365 days.';
  if (!form.reason.trim() || form.reason.trim().length > 2000) errors.reason = 'Enter a reason of 1 to 2000 characters.';
  const phone = normalizeEmergencyContact(form.emergencyContact);
  if (form.emergencyContact.length > 50 || (phone && !/^\+?[0-9]{10,15}$/.test(phone))) errors.emergencyContact = 'Enter 10 to 15 digits, with an optional country prefix (+).';
  return errors;
}
export function searchLeaveRequests(requests, search) {
  const terms = search.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return requests.filter((request) => {
    const text = [request.reason, request.resident.fullName, request.room.roomNumber, request.fromDate, request.toDate, request.status, request.response].filter(Boolean).join(' ').toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
}
export function leavePage(requests, page) {
  const total = requests.length, totalPages = Math.ceil(total / LEAVE_PAGE_SIZE), current = Math.max(1, Math.min(page, totalPages || 1));
  return { requests: requests.slice((current - 1) * LEAVE_PAGE_SIZE, current * LEAVE_PAGE_SIZE), pagination: { total, totalPages, page: current, limit: LEAVE_PAGE_SIZE, hasMore: current * LEAVE_PAGE_SIZE < total } };
}
export async function fetchLeaveSearch(api, endpoint, filters, signal) {
  const rows = []; let page = 1;
  while (true) {
    if (signal?.aborted) throw new Error('Leave search cancelled');
    const data = (await api.get(endpoint, { params: { ...filters, page, limit: 100 }, signal })).data.data;
    rows.push(...data.requests);
    if (!data.pagination.hasMore) break;
    page++;
  }
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}
