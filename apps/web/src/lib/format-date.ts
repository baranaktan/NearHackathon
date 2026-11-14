const dateTime = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const full = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

export const formatDateTime = (ms: number): string => dateTime.format(ms);
export const formatDateTimeFull = (ms: number): string => full.format(ms);
