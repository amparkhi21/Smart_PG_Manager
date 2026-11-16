const TZ = 'Asia/Kolkata';

const money = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const compact = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 });

export const formatCurrency = (n) => money.format(Number(n) || 0);
export const formatCompact = (n) => compact.format(Number(n) || 0);

export const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ }) : '-';

// "2026-11" -> "November 2026"
export const formatMonth = (m) =>
  m ? new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';

export const currentMonth = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date()).slice(0, 7);

// Turns any Axios error into a friendly message for toasts and forms
export function getErrorMessage(err) {
  if (!err?.response) return 'Cannot reach the server. Check your internet or make sure the backend is running.';
  const { message, errors } = err.response.data || {};
  if (Array.isArray(errors) && errors.length) return errors.map((e) => e.message).join('. ');
  return message || 'Something went wrong. Please try again.';
}
// For <input type="date">: "2026-11-15"
export const todayInput = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
export const toDateInput = (d) => (d ? new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(d)) : '');
// "16 Nov 2026, 3:42 pm" in India time
export const formatDateTime = (d) =>
  d
    ? new Date(d).toLocaleString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ,
      })
    : '-';

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;