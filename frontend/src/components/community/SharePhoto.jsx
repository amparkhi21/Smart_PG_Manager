import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal.jsx';
import { photoError } from '../../utils/communityMedia.js';
import { communityError } from '../../utils/community.js';

function PhotoDialog({ onClose, upload }) {
  const [file, setFile] = useState(null), [preview, setPreview] = useState('');
  const [saving, setSaving] = useState(false), [error, setError] = useState('');
  const busy = useRef(false);
  useEffect(() => {
    if (!file || photoError(file)) { setPreview(''); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const submit = async (event) => {
    event.preventDefault(); if (busy.current) return;
    const invalid = photoError(file); setError(invalid); if (invalid) return;
    busy.current = true; setSaving(true);
    try { await upload(file); toast.success('Photo shared'); onClose(); }
    catch (err) { setError(communityError(err)); }
    finally { busy.current = false; setSaving(false); }
  };
  return <Modal title="Share a community photo" onClose={onClose} dismissable={!saving}><form onSubmit={submit} className="space-y-4">
    <p className="text-sm text-slate-500">JPG, PNG or WebP, up to 5 MB. Only members of your PG can view this photo.</p>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    <label className="label" htmlFor="community-photo">Photo</label><input id="community-photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={saving} className="input py-2" onChange={(event) => { const selected = event.target.files?.[0]; setFile(selected || null); setError(selected ? photoError(selected) : ''); }} />
    {preview && <img src={preview} alt="Photo preview" className="mx-auto max-h-64 max-w-full rounded-xl object-contain" />}
    <div className="flex justify-end gap-3"><button type="button" className="btn-secondary" disabled={saving} onClick={onClose}>Cancel</button><button type="submit" className="btn-primary" disabled={saving || Boolean(photoError(file))}>{saving && <Loader2 size={16} className="animate-spin" />}Share photo</button></div>
  </form></Modal>;
}
export default function SharePhoto({ upload, disabled }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" className="btn-secondary" onClick={() => setOpen(true)} disabled={disabled}><ImagePlus size={18} /><span className="sr-only sm:not-sr-only">Share photo</span></button>{open && <PhotoDialog upload={upload} onClose={() => setOpen(false)} />}</>;
}
