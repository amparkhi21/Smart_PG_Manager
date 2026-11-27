// Shared application values. Preserve enum ordering and configured defaults.
export const VERIFY_WARNING = 'A UTR is only what the resident typed, not proof of payment. Confirm the money arrived in your own UPI/bank account before approving.';

export const MESSAGE_MAX_LENGTH = 2000;

export const COMMUNITY_ISSUE_CATEGORIES = ['General Discussion', 'Water Problem', 'Electricity Problem', 'Wi-Fi Problem', 'Cleaning / Maintenance', 'Food / Mess', 'Other Hostel Issue'];

export const COMMUNITY_ISSUE_STATUSES = ['Open', 'In Progress', 'Resolved'];

export const COMPLAINT_CATEGORIES = ['Maintenance', 'Electricity', 'Water', 'Wi-Fi', 'Cleaning', 'Food', 'Other'];

export const COMPLAINT_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];

export const COMPLAINT_STATUSES = ['Open', 'In Progress', 'Resolved'];

export const CONTACT_CATEGORIES = ['PG Owner', 'Caretaker', 'Security', 'Maintenance', 'Medical', 'Police', 'Fire', 'Other'];

export const GENERAL_REQUEST_CATEGORIES = ['Maintenance', 'Private Issue', 'Other / General'];

export const REQUEST_CATEGORIES = ['Payment Verification', 'Room / Bed Change', 'Leave Request', ...GENERAL_REQUEST_CATEGORIES];

export const GENERAL_REQUEST_PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'];

export const GENERAL_REQUEST_STATUSES = ['Open', 'In Progress', 'Resolved', 'Rejected', 'Cancelled'];

export const REQUEST_STATUSES = [...new Set(['Pending Verification', 'Pending', ...GENERAL_REQUEST_STATUSES, 'Approved', 'Rejected', 'Cancelled'])];

export const LEAVE_STATUSES = ['Pending', 'Approved', 'Rejected', 'Cancelled'];

export const ACTIVE_LEAVE_STATUSES = ['Pending', 'Approved'];

export const MEAL_KEYS = ['breakfast', 'lunch', 'eveningSnacks', 'dinner'];

export const SERVING_TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d(?:-(?:[01]\d|2[0-3]):[0-5]\d)?$/;

export const NOTIFICATION_TARGETS = {
  complaint_created: ['owner', '/requests'],
  complaint_status_updated: ['resident', '/resident/requests'],
  complaint_response: ['resident', '/resident/requests'],
  room_change_requested: ['owner', '/room-change-requests'],
  room_change_approved: ['resident', '/resident/room-change-requests'],
  room_change_rejected: ['resident', '/resident/room-change-requests'],
  leave_requested: ['owner', '/leave-requests'],
  leave_approved: ['resident', '/resident/leave-requests'],
  leave_rejected: ['resident', '/resident/leave-requests'],
  payment_claim_submitted: ['owner', '/payment-requests'],
  payment_approved: ['resident', '/resident/payments'],
  payment_rejected: ['resident', '/resident/payments'],
  notice_published: ['resident', '/resident/notices'],
  rent_due: ['resident', '/resident/payments'],
  bill_due: ['resident', '/resident/payments'],
};

export const CLAIM_STATUSES = ['Pending Verification', 'Approved', 'Rejected', 'Cancelled'];

export const BILL_TYPES = ['Rent', 'Electricity'];

export const DEFAULT_GEMINI_MODEL = 'gemini-3.6-flash';

export const GEMINI_ATTEMPT_TIMEOUT_MS = 45000;

export const RETRY_DELAYS_MS = [2000, 4000];

export const GEMINI_PLAN_TIMEOUT_MS = GEMINI_ATTEMPT_TIMEOUT_MS * 3 + RETRY_DELAYS_MS.reduce((sum, delay) => sum + delay, 0);

export const PAYMENT_METHODS = ['Cash', 'UPI', 'Bank Transfer', 'Other'];

export const PAYMENT_STATUSES = ['Paid', 'Pending', 'Partially Paid', 'Overdue'];

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export const UPI_ID_RE = /^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9.-]{1,63}$/;
