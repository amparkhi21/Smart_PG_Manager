const TONES = {
  default: 'text-slate-600 hover:bg-slate-50',
  danger: 'border-rose-100! text-rose-600 hover:bg-rose-50',
};

export default function IconButton({ icon: Icon, label, tone = 'default', className = '', ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 transition disabled:cursor-not-allowed disabled:opacity-40 ${TONES[tone]} ${className}`}
      {...props}
    >
      <Icon size={18} />
    </button>
  );
}