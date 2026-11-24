const TZ = 'Asia/Kolkata';
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// "2026-11-15"
export const todayIST = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());

// "2026-11"
export const currentMonthIST = () => todayIST().slice(0, 7);
export const dateInputIST = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(date));

// Due date (end of day, IST) for a "YYYY-MM" month and a due day number
export const dueDateFor = (month, day = 5) =>
  new Date(`${month}-${String(day).padStart(2, '0')}T23:59:59+05:30`);

// Last millisecond of a "YYYY-MM" month in IST
export const monthEndIST = (month) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 1) - IST_OFFSET_MS - 1);
};

// True only for real calendar dates written as YYYY-MM-DD
export const isRealDate = (s) =>
  typeof s === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
