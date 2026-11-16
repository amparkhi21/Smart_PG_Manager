import { ChevronLeft, ChevronRight } from 'lucide-react';
import IconButton from '../ui/IconButton.jsx';
import { shiftDate } from '../../utils/dates.js';

export default function DateNavigator({ date, today, onChange, disabled }) {
  return (
    <div className="flex items-center gap-2">
      <IconButton icon={ChevronLeft} label="Previous day" disabled={disabled} onClick={() => onChange(shiftDate(date, -1))} />
      <input
        type="date"
        value={date}
        max={today}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="input min-w-0 flex-1 sm:w-44 sm:flex-none"
        aria-label="Attendance date"
      />
      <IconButton icon={ChevronRight} label="Next day" disabled={disabled || date >= today} onClick={() => onChange(shiftDate(date, 1))} />
      {date !== today && (
        <button type="button" className="btn-secondary min-h-11" disabled={disabled} onClick={() => onChange(today)}>
          Today
        </button>
      )}
    </div>
  );
}