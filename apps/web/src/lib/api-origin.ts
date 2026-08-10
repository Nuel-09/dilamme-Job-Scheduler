/** Direct API origin for SSE (Render static rewrites do not support long-lived streams). */
export function getApiOrigin(): string {
  const origin = import.meta.env.VITE_API_ORIGIN as string | undefined;
  return origin?.replace(/\/$/, '') ?? '';
}

export function sseEventsUrl(): string {
  const origin = getApiOrigin();
  return origin ? `${origin}/api/events` : '/api/events';
}
