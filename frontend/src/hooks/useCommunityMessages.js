import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api/client.js';
import { COMMUNITY_POLL_MS, communityError, compareMessages, mergeMessages, reconcileMessages } from '../utils/community.js';

const ENDPOINT = '/community/messages';

export default function useCommunityMessages(expectedPgId) {
  const lifecycle = useRef(null);
  const [state, setState] = useState({ messages: [], initialized: false, loading: true, refreshing: false, loadingOlder: false, hasMore: false, error: '', olderError: '', change: { kind: 'initial', serial: 0, added: 0 } });
  const active = (life) => lifecycle.current === life && !life.controller.signal.aborted;
  const publish = (life, patch) => { if (active(life)) setState((current) => ({ ...current, ...patch })); };
  const acceptPage = (life, page) => {
    if (!page.pgId || (life.pgId && page.pgId !== life.pgId) || page.messages.some((message) => message.pgId !== page.pgId)) {
      const error = new Error('Invalid community scope'); error.communityScope = true; throw error;
    }
    life.pgId = page.pgId;
    return page;
  };
  const fetchPage = async (life, before) => acceptPage(life, (await api.get(ENDPOINT, {
    params: { limit: 30, ...(before && { before }) }, signal: life.controller.signal,
  })).data.data);
  const changeMessages = (life, messages, kind) => {
    messages = messages.filter((message) => !life.deleted.has(message.id));
    const previous = new Set(life.messages.map((message) => message.id));
    const added = messages.filter((message) => !previous.has(message.id)).length;
    life.messages = messages;
    publish(life, { messages: life.messages, change: { kind, serial: ++life.serial, added } });
  };

  const refresh = useCallback(async () => {
    const life = lifecycle.current;
    if (!life || !active(life) || life.busy || life.blocked) return;
    life.busy = true;
    const revision = life.revision, initial = !life.initialized;
    publish(life, { loading: initial, refreshing: !initial, error: '' });
    try {
      let page = await fetchPage(life);
      const newest = page.messages[0], incoming = [...page.messages];
      // Catch up across a busy interval without skipping messages between the latest page and the last refresh.
      while (!initial && page.hasMore && page.nextCursor && incoming.length && (!life.anchor || !incoming.some((message) => compareMessages(message, life.anchor) <= 0))) {
        page = await fetchPage(life, page.nextCursor);
        incoming.push(...page.messages);
      }
      if (!active(life)) return;
      const messages = reconcileMessages(life.messages, incoming, life.pgId, page.hasMore, revision !== life.revision);
      if (initial || !page.hasMore) {
        life.cursor = page.nextCursor; life.hasMore = page.hasMore;
      }
      life.anchor = newest || null; life.initialized = true;
      changeMessages(life, messages, initial ? 'initial' : 'latest');
      publish(life, { initialized: true, hasMore: life.hasMore });
    } catch (error) {
      if (!active(life)) return;
      if (error.communityScope) { life.blocked = true; changeMessages(life, [], 'initial'); }
      publish(life, { error: communityError(error), ...(error.communityScope && { initialized: false }) });
    } finally {
      life.busy = false; publish(life, { loading: false, refreshing: false });
    }
  }, []);

  useEffect(() => {
    const life = { controller: new AbortController(), messages: [], pgId: expectedPgId || null, busy: false, blocked: false, initialized: false, hasMore: false, cursor: null, anchor: null, deleted: new Set(), revision: 0, serial: 0 };
    lifecycle.current = life;
    refresh();
    const resume = () => { if (document.visibilityState === 'visible' && navigator.onLine) refresh(); };
    const timer = window.setInterval(resume, COMMUNITY_POLL_MS);
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('focus', resume); window.addEventListener('app:resume', resume); window.addEventListener('online', resume);
    return () => {
      life.controller.abort(); window.clearInterval(timer);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('focus', resume); window.removeEventListener('app:resume', resume); window.removeEventListener('online', resume);
    };
  }, [expectedPgId, refresh]);

  const loadOlder = async () => {
    const life = lifecycle.current;
    if (!life || !active(life) || life.busy || life.blocked || !life.cursor || !life.hasMore) return;
    life.busy = true; publish(life, { loadingOlder: true, olderError: '' });
    try {
      const page = await fetchPage(life, life.cursor);
      if (!active(life)) return;
      life.cursor = page.nextCursor; life.hasMore = page.hasMore;
      changeMessages(life, mergeMessages(life.messages, page.messages, life.pgId), 'older');
      publish(life, { hasMore: life.hasMore });
    } catch (error) {
      if (error.communityScope && active(life)) { life.blocked = true; changeMessages(life, [], 'initial'); }
      publish(life, error.communityScope ? { initialized: false, error: communityError(error) } : { olderError: communityError(error) });
    } finally { life.busy = false; publish(life, { loadingOlder: false }); }
  };
  const send = async (payload) => {
    const life = lifecycle.current;
    if (!life || !active(life) || life.blocked || !life.initialized) throw new Error('Community is unavailable');
    const message = (await api.post(ENDPOINT, payload, { signal: life.controller.signal })).data.data;
    acceptPage(life, { pgId: message.pgId, messages: [message] });
    if (!active(life)) return;
    acceptPage(life, { pgId: message.pgId, messages: [message] });
    life.revision++;
    changeMessages(life, mergeMessages(life.messages, [message], life.pgId), 'sent');
    return message;
  };
  const remove = async (id) => {
    const life = lifecycle.current;
    if (!life || !active(life) || life.blocked) return;
    await api.delete(`${ENDPOINT}/${id}`, { signal: life.controller.signal });
    if (!active(life)) return;
    life.deleted.add(id); life.revision++;
    changeMessages(life, life.messages.filter((message) => message.id !== id), 'deleted');
  };
  const sendPhoto = async (file) => {
    const life = lifecycle.current;
    if (!life || !active(life) || life.blocked || !life.initialized) throw new Error('Community is unavailable');
    const message = (await api.post('/community/images', file, { headers: { 'Content-Type': file.type }, signal: life.controller.signal })).data.data;
    if (!active(life)) return;
    acceptPage(life, { pgId: message.pgId, messages: [message] });
    life.revision++; changeMessages(life, mergeMessages(life.messages, [message], life.pgId), 'sent');
    return message;
  };
  return { ...state, refresh, loadOlder, send, sendPhoto, remove };
}
