export function dwellMinutes(
  checkedInAt: string | Date,
  asOf: string | Date,
  checkedOutAt?: string | Date | null,
): number {
  const start = new Date(checkedInAt).getTime();
  const end = new Date(checkedOutAt ?? asOf).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(0, Math.round((end - start) / 60_000));
}

export function formatDwell(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  if (hours <= 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}
