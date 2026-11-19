import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { registerBackHandler } from '../../native/backNavigation.js';

const WIDTHS = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl' };
let openDialogs = 0;
let previousOverflow = '';

// Bottom sheet on phones, centered dialog on larger screens
export default function Modal({ title, onClose, children, size = 'md', dismissable = true }) {
  const dialog = useRef(null);
  const current = useRef({ onClose, dismissable });
  current.current = { onClose, dismissable };
  useEffect(() => registerBackHandler(() => {
    if (current.current.dismissable) current.current.onClose();
  }), []);
  useEffect(() => {
    const previousFocus = document.activeElement;
    dialog.current?.focus();
    const onKey = (e) => {
      if (Array.from(document.querySelectorAll('[role="dialog"]')).at(-1) !== dialog.current) return;
      if (e.key === 'Escape' && current.current.dismissable) current.current.onClose();
      if (e.key === 'Tab') {
        const focusable = Array.from(dialog.current?.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]') || []);
        const first = focusable[0]; const last = focusable.at(-1);
        if (!first) { e.preventDefault(); return; }
        if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    if (openDialogs++ === 0) previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      if (--openDialogs === 0) document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return createPortal(
    <div ref={dialog} tabIndex={-1} className="modal-overlay fixed inset-0 z-50 flex items-end justify-center outline-none sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-navy-950/50 backdrop-blur-[2px]" onClick={dismissable ? onClose : undefined} />
      <div className={`modal-panel relative flex min-h-0 min-w-0 w-full animate-fade-in flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl ${WIDTHS[size]}`}>
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <h2 className="min-w-0 truncate text-lg font-bold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={!dismissable}
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 disabled:opacity-40"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="modal-content min-h-0 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
      </div>
    </div>, document.body
  );
}
