import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { isAndroid, Native } from '../native/platform.js';
import { backAction, dismissTopLayer } from '../native/backNavigation.js';
import { validateExternalUrl } from '../native/external.js';

export default function NativeRuntime() {
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = useRef(location.pathname);
  pathname.current = location.pathname;
  useEffect(() => {
    if (!isAndroid) return;
    let disposed = false;
    const handles = [];
    const listen = async (event, callback) => {
      const handle = await Native.addListener(event, callback);
      if (disposed) await handle.remove(); else handles.push(handle);
    };
    Promise.all([
      listen('backButton', () => {
        if (dismissTopLayer()) return;
        const action = backAction(pathname.current, window.history.state?.idx);
        if (action === 'minimize') Native.minimizeApp().catch(() => {});
        else if (action === 'back') navigate(-1);
        else navigate(action === 'login' ? '/login' : action === 'owner-login' ? '/owner/login' : action === 'resident-home' ? '/resident/dashboard' : '/', { replace: true });
      }),
      listen('resume', () => window.dispatchEvent(new Event('app:resume'))),
    ]).then(() => { if (!disposed) return Native.ready(); }).catch(() => {
      toast.error('Some Android features could not start. Close and reopen the app.');
    });
    const openLink = (event) => {
      const anchor = event.target.closest?.('a[href]');
      if (!anchor || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin === window.location.origin) return;
      event.preventDefault();
      try {
        Native.openExternal({ url: validateExternalUrl(url.href) }).catch(() => toast.error('No app could open this link.'));
      } catch (error) { toast.error(error.message); }
    };
    let fullHeight = window.visualViewport?.height || window.innerHeight;
    const measure = () => {
      const height = window.visualViewport?.height || window.innerHeight;
      const input = document.activeElement?.matches('input, textarea, select, [contenteditable="true"]');
      if (!input) fullHeight = Math.max(height, fullHeight);
      const keyboard = input && fullHeight - height > 120;
      document.documentElement.classList.toggle('keyboard-open', Boolean(keyboard));
      if (keyboard) document.activeElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    document.addEventListener('click', openLink);
    document.addEventListener('focusin', measure);
    document.addEventListener('focusout', measure);
    window.visualViewport?.addEventListener('resize', measure);
    window.addEventListener('resize', measure);
    return () => {
      disposed = true;
      handles.forEach((handle) => handle.remove());
      document.removeEventListener('click', openLink);
      document.removeEventListener('focusin', measure);
      document.removeEventListener('focusout', measure);
      window.visualViewport?.removeEventListener('resize', measure);
      window.removeEventListener('resize', measure);
      document.documentElement.classList.remove('keyboard-open');
    };
  }, [navigate]);
  return null;
}
