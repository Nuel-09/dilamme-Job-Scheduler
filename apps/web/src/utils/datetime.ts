/** Convert datetime-local value (YYYY-MM-DDTHH:mm) to ISO 8601 for the API. */
export function datetimeLocalToIso(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid scheduled date');
  }
  return date.toISOString();
}
