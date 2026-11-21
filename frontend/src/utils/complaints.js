export const COMPLAINT_CATEGORIES = ['Maintenance', 'Electricity', 'Water', 'Wi-Fi', 'Cleaning', 'Food', 'Other'];
export const COMPLAINT_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
export const COMPLAINT_STATUSES = ['Open', 'In Progress', 'Resolved'];
export const COMPLAINT_PAGE_SIZE = 20;

export function complaintErrors(form) {
  const errors = {};
  if (!form.title.trim() || form.title.trim().length > 120) errors.title = 'Enter a title of 1 to 120 characters.';
  if (!form.description.trim() || form.description.trim().length > 5000) errors.description = 'Enter a description of 1 to 5000 characters.';
  if (!COMPLAINT_CATEGORIES.includes(form.category)) errors.category = 'Choose a complaint category.';
  if (!COMPLAINT_PRIORITIES.includes(form.priority)) errors.priority = 'Choose a priority.';
  return errors;
}
export function searchComplaints(complaints, search) {
  const terms = search.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return complaints.filter((complaint) => {
    const text = [complaint.title, complaint.description, complaint.category, complaint.priority, complaint.status,
      complaint.resident?.fullName, complaint.resident?.roomNumberAtCreation, complaint.room?.roomNumber].filter(Boolean).join(' ').toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
}
export function complaintPage(complaints, page, limit = COMPLAINT_PAGE_SIZE) {
  const total = complaints.length, totalPages = Math.ceil(total / limit), current = Math.max(1, Math.min(page, totalPages || 1));
  return { complaints: complaints.slice((current - 1) * limit, current * limit), pagination: { page: current, limit, total, totalPages, hasMore: current * limit < total } };
}
// The API has no text-search parameter. Read its authorized pages, then search locally.
export async function fetchComplaintSearch(api, endpoint, filters, signal) {
  const complaints = []; let page = 1;
  while (true) {
    if (signal?.aborted) throw new Error('Complaint search cancelled');
    const result = (await api.get(endpoint, { params: { ...filters, page, limit: 100 }, signal })).data.data;
    complaints.push(...result.complaints);
    if (!result.pagination.hasMore) break;
    page++;
  }
  return [...new Map(complaints.map((complaint) => [complaint.id, complaint])).values()];
}
