export default function SegmentedControl({ options, value, onChange }) {
  return (
    <div className="inline-flex max-w-full overflow-x-auto rounded-xl bg-slate-100 p-1" role="tablist">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="tab"
          aria-selected={value === o}
          onClick={() => onChange(o)}
          className={`min-h-9 shrink-0 rounded-lg px-3.5 text-sm font-semibold transition ${
            value === o ? 'bg-white text-navy-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}