import { useCallback, useEffect, useRef, useState } from 'react';
import { getErrorMessage } from '../utils/format.js';

// Runs an async fetcher, tracks loading/error, and re-runs when `deps` change.
// Responses from outdated requests are ignored.
export default function useFetch(fetcher, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const latest = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(async () => {
    const id = ++latest.current;
    setLoading(true);
    setError('');
    try {
      const result = await fetcher();
      if (id === latest.current) setData(result);
    } catch (err) {
      if (id === latest.current) setError(getErrorMessage(err));
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, deps);

  useEffect(() => {
    load();
    return () => { latest.current += 1; };
  }, [load]);

  return { data, loading, error, reload: load, setData };
}
