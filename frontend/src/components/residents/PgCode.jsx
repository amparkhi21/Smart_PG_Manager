import { useState } from 'react';
import { Copy, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext.jsx';
import { copyText } from '../../native/external.js';

export default function PgCode({ className = '' }) {
  const { owner } = useAuth();
  const [copying, setCopying] = useState(false);
  if (!owner?.pgCode) return null;

  const copy = async () => {
    setCopying(true);
    try {
      await copyText(owner.pgCode);
      toast.success('PG code copied');
    } catch {
      toast.error('Could not access the clipboard. Select and copy the PG code manually.');
    } finally { setCopying(false); }
  };

  return <div className={`flex min-w-0 flex-wrap items-center justify-between gap-3 ${className}`}>
    <p className="min-w-0 text-sm text-slate-600">PG code: <code className="select-all break-all font-semibold text-navy-900">{owner.pgCode}</code></p>
    <button type="button" className="btn-secondary shrink-0" onClick={copy} disabled={copying}>
      {copying ? <Loader2 size={16} className="animate-spin" /> : <Copy size={16} />} Copy PG code
    </button>
  </div>;
}
