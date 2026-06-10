import { useEffect, useRef, useCallback } from 'react';
import type { JobEvent } from '../api';

export function useJobEvents(onEvent: (event: JobEvent) => void) {
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;

  const stableHandler = useCallback((event: JobEvent) => {
    callbackRef.current(event);
  }, []);

  useEffect(() => {
    const source = new EventSource('/api/events');

    source.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data) as JobEvent;
        if (data.type === 'heartbeat' || data.type === 'connected') return;
        stableHandler(data);
      } catch {
        /* ignore parse errors */
      }
    };

    source.onerror = () => {
      /* EventSource auto-reconnects */
    };

    return () => source.close();
  }, [stableHandler]);
}
