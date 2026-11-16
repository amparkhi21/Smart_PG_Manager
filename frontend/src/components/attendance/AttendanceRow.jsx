import { useState } from 'react';
import { Check, MessageSquarePlus, Minus, X } from 'lucide-react';
import StatusBadge from '../ui/StatusBadge.jsx';

const OPTIONS = [
  { value: 'Present', icon: Check, active: 'bg-emerald-600 text-white border-emerald-600' },
  { value: 'Absent', icon: X, active: 'bg-rose-600 text-white border-rose-600' },
  { value: 'On Leave', icon: Minus, active: 'bg-amber-500 text-white border-amber-500' },
];

// Left accent colour makes each state easy to tell apart at a glance
const ACCENT = {
  Present: 'border-l-emerald-500!',
  Absent: 'border-l-rose-500!',
  'On Leave': 'border-l-amber-400!',
  Unmarked: 'border-l-slate-300!',
};

// row = one item from GET /attendance. draft = unsaved {status, note} for this resident, if any.
export default function AttendanceRow({ row, draft, onChange, disabled }) {
  const [noteOpen, setNoteOpen] = useState(false);
  const status = draft ? draft.status : row.status;
  const note = draft ? draft.note : row.note || '';

  return (
    <li className={`card border-l-4! p-3 sm:p-4 ${ACCENT[status || 'Unmarked']} ${draft ? 'ring-2 ring-teal-400/60' : ''}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="min-w-0 md:w-60">
          <p className="truncate font-semibold text-slate-900">{row.resident.fullName}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>Room {row.room?.roomNumber || '-'}</span>
            <StatusBadge status={row.status || 'Unmarked'} />
            {draft && <span className="font-semibold text-teal-600">Unsaved</span>}
          </div>
        </div>

        <div className="flex flex-1 gap-2" role="group" aria-label={`Attendance for ${row.resident.fullName}`}>
          {OPTIONS.map(({ value, icon: Icon, active }) => {
            const selected = status === value;
            return (
              <button
                key={value}
                type="button"
                disabled={disabled}
                aria-pressed={selected}
                onClick={() => !selected && onChange({ status: value, note })}
                className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border text-sm font-semibold transition active:scale-[0.97] disabled:opacity-60 ${
                  selected ? active : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Icon size={16} className="hidden min-[400px]:block" />
                {value}
              </button>
            );
          })}
        </div>
      </div>

      {status && (noteOpen || note) ? (
        <input
          type="text"
          value={note}
          maxLength={200}
          disabled={disabled}
          onChange={(e) => onChange({ status, note: e.target.value })}
          placeholder="Note (e.g. Went home, College holiday)"
          aria-label={`Note for ${row.resident.fullName}`}
          className="input mt-3"
          autoFocus={noteOpen && !note}
        />
      ) : status ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setNoteOpen(true)}
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-teal-600 hover:text-teal-700"
        >
          <MessageSquarePlus size={14} /> Add note
        </button>
      ) : null}
    </li>
  );
}