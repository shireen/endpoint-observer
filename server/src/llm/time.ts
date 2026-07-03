/** Shared interpretation/display timezone for monitoring data and AI answers. */
export const DISPLAY_TIME_ZONE = 'America/Chicago';
export const DISPLAY_TIME_ZONE_LABEL = 'Central Time';

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

export function formatCentralTime(ms: number): string {
  return timeFormatter.format(new Date(ms));
}

/** Dynamic context makes relative phrases such as "today" unambiguous. */
export function timeContext(now = Date.now()): string {
  return [
    `The product's shared display timezone is ${DISPLAY_TIME_ZONE} (${DISPLAY_TIME_ZONE_LABEL}).`,
    `Current reference time: ${formatCentralTime(now)} (${new Date(now).toISOString()} UTC).`,
    'Interpret calendar and clock phrases such as "today", "this morning", and "at 2pm" in that timezone.',
    'Report human-readable times in Central Time with the CDT/CST abbreviation; use UTC only as a secondary reference.',
  ].join(' ');
}
