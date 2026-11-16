import { Select } from './FormControls.jsx';
import { currentMonth } from '../../utils/format.js';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// value / onChange use "YYYY-MM". Future months are not selectable.
export default function MonthYearPicker({ value, onChange, disabled }) {
  const now = currentMonth();
  const nowYear = Number(now.slice(0, 4));
  const nowMon = Number(now.slice(5, 7));
  const year = Number(value.slice(0, 4));
  const mon = Number(value.slice(5, 7));

  const emit = (y, m) => {
    const safeMonth = y === nowYear && m > nowMon ? nowMon : m;
    onChange(`${y}-${String(safeMonth).padStart(2, '0')}`);
  };

  return (
    <div className="flex gap-2">
      <div className="min-w-0 flex-1 sm:w-40 sm:flex-none">
        <Select value={mon} disabled={disabled} aria-label="Month" onChange={(e) => emit(year, Number(e.target.value))}>
          {MONTHS.map((name, i) => (
            <option key={name} value={i + 1} disabled={year === nowYear && i + 1 > nowMon}>{name}</option>
          ))}
        </Select>
      </div>
      <div className="w-28 shrink-0">
        <Select value={year} disabled={disabled} aria-label="Year" onChange={(e) => emit(Number(e.target.value), mon)}>
          {[0, 1, 2, 3].map((i) => <option key={i} value={nowYear - i}>{nowYear - i}</option>)}
        </Select>
      </div>
    </div>
  );
}