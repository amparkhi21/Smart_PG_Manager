import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Loader2, Megaphone, MessageCircle, RefreshCw, Send, ShieldCheck, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext.jsx';
import useCommunityMessages from '../hooks/useCommunityMessages.js';
import PageHeader from '../components/ui/PageHeader.jsx';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { Textarea } from '../components/ui/FormControls.jsx';
import { COMMUNITY_MESSAGE_LIMIT, communityError, isOwnMessage, messageError } from '../utils/community.js';
import { formatDateTime } from '../utils/format.js';
import SharePhoto from '../components/community/SharePhoto.jsx';
import PrivatePhoto from '../components/community/PrivatePhoto.jsx';

function CommunityChat({ user, role, pgId }) {
  const chat = useCommunityMessages(pgId);
  const [text, setText] = useState('');
  const [announcement, setAnnouncement] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [target, setTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [nearBottom, setNearBottom] = useState(true);
  const [unread, setUnread] = useState(false);
  const [viewport, setViewport] = useState(() => window.visualViewport?.height || window.innerHeight);
  const list = useRef(null), input = useRef(null);
  const submitting = useRef(false), removing = useRef(false), mounted = useRef(false);
  const position = useRef({ bottom: true, anchor: null, offset: 0, top: 0 });
  const userId = user.id || user._id;
  const owner = role === 'owner';
  const capture = () => {
    const element = list.current;
    if (!element) return;
    const bounds = element.getBoundingClientRect();
    const anchor = [...element.querySelectorAll('[data-message-id]')].find((node) => node.getBoundingClientRect().bottom > bounds.top);
    const bottom = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
    position.current = { bottom, anchor: anchor?.dataset.messageId, offset: anchor ? anchor.getBoundingClientRect().top - bounds.top : 0, top: element.scrollTop };
    setNearBottom(bottom); if (bottom) setUnread(false);
  };
  const latest = () => { if (list.current) { list.current.scrollTop = list.current.scrollHeight; capture(); } };
  useLayoutEffect(() => {
    const element = list.current;
    if (!element) return;
    const saved = position.current;
    if (chat.change.kind === 'initial' || chat.change.kind === 'sent' || (saved.bottom && chat.change.kind !== 'older')) latest();
    else {
      const anchor = [...element.querySelectorAll('[data-message-id]')].find((node) => node.dataset.messageId === saved.anchor);
      if (anchor) element.scrollTop += anchor.getBoundingClientRect().top - element.getBoundingClientRect().top - saved.offset;
      else element.scrollTop = saved.top;
      if (chat.change.kind === 'latest' && chat.change.added) setUnread(true);
      capture();
    }
  }, [chat.messages, chat.change.serial]);
  useEffect(() => {
    mounted.current = true;
    const resize = () => setViewport(window.visualViewport?.height || window.innerHeight);
    window.visualViewport?.addEventListener('resize', resize); window.addEventListener('resize', resize);
    const observer = new ResizeObserver(() => { if (position.current.bottom) latest(); else capture(); });
    if (list.current) observer.observe(list.current);
    return () => { mounted.current = false; observer.disconnect(); window.visualViewport?.removeEventListener('resize', resize); window.removeEventListener('resize', resize); };
  }, []);
  const submit = async (event) => {
    event?.preventDefault();
    if (submitting.current || !chat.initialized) return;
    const invalid = messageError(text); setError(invalid); if (invalid) return;
    submitting.current = true; setSending(true);
    try {
      const message = await chat.send({ text: text.trim(), kind: owner && announcement ? 'announcement' : 'message' });
      if (mounted.current && message) { setText(''); setAnnouncement(false); requestAnimationFrame(() => { if (mounted.current) input.current?.focus({ preventScroll: true }); }); }
    } catch (err) { if (mounted.current) setError(communityError(err)); }
    finally { submitting.current = false; if (mounted.current) setSending(false); }
  };
  const remove = async () => {
    if (removing.current) return;
    removing.current = true; setDeleting(true); setError('');
    try { await chat.remove(target.id); if (mounted.current) { setTarget(null); toast.success('Message deleted'); } }
    catch (err) { if (mounted.current) { setTarget(null); setError(communityError(err)); } }
    finally { removing.current = false; if (mounted.current) setDeleting(false); }
  };
  return <div>
    <PageHeader title="Community" subtitle="Stay connected with your PG. Message times are shown in IST.">
      <button type="button" className="btn-secondary" onClick={chat.refresh} disabled={chat.loading || chat.refreshing || chat.loadingOlder}><RefreshCw size={16} className={chat.refreshing ? 'animate-spin' : ''} />Refresh chat</button>
    </PageHeader>
    <section aria-label="PG community chat" className="community-chat card flex min-w-0 flex-col overflow-hidden" style={{ '--community-viewport-height': `${viewport}px` }}>
      <div className="flex shrink-0 items-center gap-3 border-b border-slate-100 bg-white px-4 py-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-orange-600"><MessageCircle size={21} aria-hidden="true" /></span>
        <div className="min-w-0"><h2 className="truncate font-bold text-navy-900">{user.pgName}</h2><p className="flex items-center gap-1 text-sm text-slate-500"><ShieldCheck size={14} aria-hidden="true" />Private PG community</p></div>
      </div>
      {chat.error && chat.initialized && <p role="alert" className="shrink-0 bg-rose-50 px-4 py-2 text-sm text-rose-700">{chat.error}</p>}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div ref={list} role="region" aria-label="Community messages" aria-busy={chat.loading || chat.loadingOlder} tabIndex={0} onScroll={capture} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-navy-50 p-3 sm:p-5" style={{ overflowAnchor: 'none' }}>
          {chat.loading ? <div role="status" aria-label="Loading community messages" className="space-y-4"><Skeleton className="h-20 w-3/4" /><Skeleton className="ml-auto h-20 w-3/4" /><Skeleton className="h-20 w-2/3" /></div>
            : !chat.initialized && chat.error ? <ErrorState message={chat.error} onRetry={chat.refresh} />
              : <>
                {chat.hasMore && <div className="text-center"><button type="button" className="btn-secondary" disabled={chat.loadingOlder || chat.refreshing} onClick={() => { capture(); chat.loadOlder(); }}>{chat.loadingOlder && <Loader2 size={16} className="animate-spin" />}Load older messages</button></div>}
                {chat.olderError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{chat.olderError}</p>}
                {!chat.messages.length && <EmptyState icon={MessageCircle} title="Start the conversation" text="Say hello, ask a question or share an update with your PG community." />}
                {chat.messages.map((message) => {
                  const own = isOwnMessage(message, userId, role), announced = message.kind === 'announcement';
                  const canDelete = message.canDelete && (owner || own);
                  return <article key={message.id} data-message-id={message.id} data-own={own} aria-label={`${message.sender.name} ${announced ? 'announcement' : 'message'}`} className={`w-fit min-w-0 max-w-[92%] rounded-2xl border p-3 shadow-sm sm:max-w-[80%] ${announced ? 'mx-auto w-full border-orange-200 bg-orange-50 text-navy-900' : own ? 'ml-auto rounded-br-md border-navy-900 bg-navy-900 text-white' : 'mr-auto rounded-bl-md border-slate-200 bg-white text-slate-800'}`}>
                    {announced && <p className="mb-2 flex items-center gap-2 text-sm font-bold text-orange-700"><Megaphone size={16} aria-hidden="true" />Announcement</p>}
                    <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"><span className="break-all font-bold">{message.sender.name}{own && ' (you)'}</span><span className={own && !announced ? 'text-navy-200' : 'text-slate-500'}>{message.sender.role === 'owner' ? 'Owner' : 'Resident'}</span></div>
                    <p className="whitespace-pre-wrap break-words text-base [overflow-wrap:anywhere]">{message.text}</p>
                    {message.image && <PrivatePhoto image={message.image} sender={message.sender.name} />}
                    <div className="mt-2 flex flex-wrap items-center justify-end gap-2"><time dateTime={message.createdAt} className={`text-xs ${own && !announced ? 'text-navy-200' : 'text-slate-500'}`}>{formatDateTime(message.createdAt)}</time>
                      {canDelete && <button type="button" aria-label="Delete message" className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${own && !announced ? 'text-navy-200 hover:bg-white/10' : 'text-slate-500 hover:bg-slate-100'}`} onClick={() => setTarget(message)}><Trash2 size={16} aria-hidden="true" /></button>}
                    </div>
                  </article>;
                })}
              </>}
        </div>
        {!nearBottom && chat.messages.length > 0 && <button type="button" aria-label="Jump to latest" className="btn-primary absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap shadow-lg" onClick={latest}>{unread ? 'New messages' : 'Jump to latest'}</button>}
      </div>
      <form onSubmit={submit} className="shrink-0 space-y-2 border-t border-slate-200 bg-white p-3 sm:p-4">
        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <SharePhoto upload={chat.sendPhoto} disabled={sending || !chat.initialized} />
        {owner && <button type="button" className={`btn ${announcement ? 'bg-orange-100 text-orange-800' : 'text-slate-500 hover:bg-slate-50'}`} aria-pressed={announcement} disabled={sending || !chat.initialized} onClick={() => setAnnouncement((value) => !value)}><Megaphone size={16} />Post as announcement</button>}
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1"><label htmlFor="community-message" className="sr-only">Message</label><Textarea ref={input} id="community-message" value={text} onChange={(event) => { setText(event.target.value); setError(''); }} rows={2} maxLength={COMMUNITY_MESSAGE_LIMIT} disabled={sending || !chat.initialized} placeholder={announcement ? 'Share an announcement...' : 'Write a message...'} aria-describedby="community-message-help" onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); submit(); } }} /></div>
          <button type="submit" className="btn-primary min-h-12 shrink-0" disabled={sending || !chat.initialized || !text.trim()} aria-label={announcement ? 'Send announcement' : 'Send message'}>{sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}<span className="hidden sm:inline">Send</span></button>
        </div>
        <p id="community-message-help" className="flex flex-wrap justify-between gap-1 text-xs text-slate-500"><span>Enter to send · Shift+Enter for a new line</span><span>{text.length}/{COMMUNITY_MESSAGE_LIMIT}</span></p>
      </form>
    </section>
    {target && <ConfirmDialog title="Delete this message?" message="Delete this message from the community? This action cannot be undone." confirmText="Delete message" loading={deleting} onConfirm={remove} onCancel={() => setTarget(null)} />}
  </div>;
}

export default function Community() {
  const { owner, resident, role } = useAuth();
  const user = owner || resident;
  const pgId = owner ? owner.id || owner._id : resident.pgId;
  return <CommunityChat key={`${role}:${user.id || user._id}:${pgId || ''}`} user={user} role={role} pgId={pgId} />;
}
