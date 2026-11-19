import { useEffect, useState } from 'react';
import { Loader2, WifiOff } from 'lucide-react';

export default function ConnectionNotice() {
  const [offline, setOffline] = useState(!navigator.onLine);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    let timer;
    const connection = () => setOffline(!navigator.onLine);
    const activity = ({ detail: pending }) => {
      if (!pending) { clearTimeout(timer); timer = undefined; setSlow(false); }
      else if (!timer) timer = setTimeout(() => setSlow(true), 8000);
    };
    window.addEventListener('online', connection);
    window.addEventListener('offline', connection);
    window.addEventListener('api:activity', activity);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('online', connection);
      window.removeEventListener('offline', connection);
      window.removeEventListener('api:activity', activity);
    };
  }, []);
  if (!offline && !slow) return null;
  return (
    <div className="connection-notice" role="status" aria-live="polite">
      {offline ? <WifiOff size={20} className="shrink-0" /> : <Loader2 size={20} className="shrink-0 animate-spin" />}
      <p className="min-w-0 text-sm">{offline
        ? 'You are offline. Reconnect, then use Try again on the page.'
        : 'The server is taking longer than usual. It may be waking up. Please keep this screen open.'}</p>
    </div>
  );
}
