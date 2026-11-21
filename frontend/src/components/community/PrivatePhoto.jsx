import { useEffect, useState } from 'react';
import { ImageOff, Loader2 } from 'lucide-react';
import api from '../../api/client.js';

export default function PrivatePhoto({ image, sender }) {
  const [url, setUrl] = useState(''), [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); let objectUrl;
    setUrl(''); setFailed(false);
    api.get(`/community/images/${image.id}`, { responseType: 'blob', signal: controller.signal }).then(({ data }) => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(data); setUrl(objectUrl);
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [image.id, attempt]);
  return <div className="my-2 flex h-48 w-64 max-w-full items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-slate-600">
    {failed ? <div className="p-3 text-center text-sm"><ImageOff size={22} className="mx-auto mb-2" /><p>Photo could not be loaded.</p><button type="button" className="btn-secondary mt-2" onClick={() => setAttempt((value) => value + 1)}>Retry photo</button></div>
      : url ? <img src={url} alt={`Community photo shared by ${sender}`} className="h-full w-full object-contain" onError={() => setFailed(true)} />
        : <span role="status" aria-label="Loading private photo"><Loader2 size={24} className="animate-spin" /></span>}
  </div>;
}
