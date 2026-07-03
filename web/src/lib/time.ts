/** One product-wide timezone keeps every tab and every viewer in sync. */
export const DISPLAY_TIME_ZONE = 'America/Chicago';
export const DISPLAY_TIME_ZONE_LABEL = 'Central Time (CDT/CST)';

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: DISPLAY_TIME_ZONE,
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  timeZoneName: 'short',
});

/** Formats an absolute timestamp in the company's DST-aware Central timezone. */
export function formatTime(ms: number): string {
  return timeFormatter.format(new Date(ms));
}
