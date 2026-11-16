// Date helpers that work on plain "YYYY-MM-DD" strings, so there is no timezone shifting.

// "2026-11-15" + 1 -> "2026-11-16"
export const shiftDate = (s, days) => {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export const weekdayLabel = (s) =>
  new Date(`${s}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'UTC' });

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const toMonthKey = (year, month) => `${year}-${String(month).padStart(2, '0')}`;