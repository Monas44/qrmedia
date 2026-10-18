import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from './api';

interface State<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
}

/** Busca dados quando `key` muda; descarta respostas antigas fora de ordem. */
export function useApi<T>(fetcher: () => Promise<T>, key: string) {
  const [state, setState] = useState<State<T>>({ data: undefined, error: null, loading: true });
  const seq = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(() => {
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetcherRef.current().then(
      (data) => id === seq.current && setState({ data, error: null, loading: false }),
      (err: unknown) => id === seq.current && setState((s) => ({ ...s, error: errorMessage(err), loading: false })),
    );
  }, []);

  useEffect(run, [key, run]);

  return { ...state, reload: run, setData: (data: T) => setState((s) => ({ ...s, data })) };
}
