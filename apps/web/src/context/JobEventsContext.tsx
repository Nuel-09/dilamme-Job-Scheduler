import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { JobEvent } from '../api';

interface SseControlMessage {
  kind: 'connected' | 'heartbeat' | 'error';
  timestamp?: string;
}

const RECONNECT_CATCHUP: JobEvent = {
  jobId: '__sse_reconnect__',
  status: 'pending',
  timestamp: '',
};

function isJobEvent(data: unknown): data is JobEvent {
  if (!data || typeof data !== 'object') return false;
  const record = data as Record<string, unknown>;
  return typeof record.jobId === 'string' && typeof record.status === 'string';
}

function isControlMessage(data: unknown): data is SseControlMessage {
  if (!data || typeof data !== 'object') return false;
  const kind = (data as SseControlMessage).kind;
  return kind === 'connected' || kind === 'heartbeat' || kind === 'error';
}

interface JobEventsContextValue {
  connected: boolean;
  subscribe: (handler: (event: JobEvent) => void) => () => void;
}

const JobEventsContext = createContext<JobEventsContextValue | null>(null);

export function JobEventsProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const subscribersRef = useRef(new Set<(event: JobEvent) => void>());

  const subscribe = useCallback((handler: (event: JobEvent) => void) => {
    subscribersRef.current.add(handler);
    return () => subscribersRef.current.delete(handler);
  }, []);

  const notify = useCallback((event: JobEvent) => {
    for (const handler of subscribersRef.current) {
      handler(event);
    }
  }, []);

  useEffect(() => {
    const source = new EventSource('/api/events');
    let connectCount = 0;

    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);

    source.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data) as unknown;

        if (isControlMessage(data)) {
          if (data.kind === 'connected') {
            connectCount += 1;
            setConnected(true);
            if (connectCount > 1) {
              notify({
                ...RECONNECT_CATCHUP,
                timestamp: data.timestamp ?? new Date().toISOString(),
              });
            }
          }
          return;
        }

        if (isJobEvent(data)) {
          notify(data);
        }
      } catch {
        /* ignore parse errors */
      }
    };

    return () => {
      source.close();
      setConnected(false);
    };
  }, [notify]);

  return (
    <JobEventsContext.Provider value={{ connected, subscribe }}>
      {children}
    </JobEventsContext.Provider>
  );
}

export function useJobEvents(onEvent: (event: JobEvent) => void) {
  const ctx = useContext(JobEventsContext);
  if (!ctx) throw new Error('useJobEvents must be used within JobEventsProvider');

  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    return ctx.subscribe((event) => handlerRef.current(event));
  }, [ctx]);
}

export function useSseStatus() {
  const ctx = useContext(JobEventsContext);
  return ctx?.connected ?? false;
}
