import { useEffect } from 'react';
import { X } from 'lucide-react';

const WIDTHS = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl' };

// Bottom sheet on phones, centered dialog on larger screens
export default function Modal({ title, onClose, children, size = 'md', dismissable = true }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && dismissable) onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose, dismissable]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-navy-950/50 backdrop-blur-[2px]" onClick={dismissable ? onClose : undefined} />
      <div className={`relative flex max-h-[92dvh] w-full animate-fade-in flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl ${WIDTHS[size]}`}>
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <h2 className="min-w-0 truncate text-lg font-bold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={!dismissable}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-40"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  );
}