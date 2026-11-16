import { AlertTriangle, Loader2 } from 'lucide-react';
import Modal from './Modal.jsx';

// Render it only while a confirmation is needed: {target && <ConfirmDialog ... />}
export default function ConfirmDialog({ title, message, confirmText = 'Confirm', tone = 'danger', loading = false, onConfirm, onCancel }) {
  const danger = tone === 'danger';
  return (
    <Modal title={title} onClose={onCancel} size="sm" dismissable={!loading}>
      <div className="flex gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${danger ? 'bg-rose-50 text-rose-600' : 'bg-orange-50 text-orange-600'}`}>
          <AlertTriangle size={20} />
        </span>
        <p className="text-sm leading-relaxed text-slate-600">{message}</p>
      </div>
      <div className="mt-5 flex gap-3">
        <button type="button" onClick={onCancel} disabled={loading} className="btn-secondary flex-1">Cancel</button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className={`btn flex-1 text-white ${danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-navy-900 hover:bg-navy-800'}`}
        >
          {loading && <Loader2 size={16} className="animate-spin" />}
          {confirmText}
        </button>
      </div>
    </Modal>
  );
}