export const CANBERRA_TIME_ZONE = "Australia/Sydney";
export const OPENING_MINUTES = 7 * 60;
export const CLOSING_MINUTES = 23 * 60;
export const BOOKING_WINDOW_DAYS = 14;
export const MAX_DAILY_MINUTES = 120;
export const DURATIONS = [30, 60, 90, 120];

const calendar = new Intl.DateTimeFormat("en-AU", {
  timeZone: CANBERRA_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

export function canberraNow(now = new Date()): { date: string; minutes: number } {
  const parts = calendar.formatToParts(now);
  const part = (key: string) => parts.find((item) => item.type === key)!.value;
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    minutes: Number(part("hour")) * 60 + Number(part("minute")) + Number(part("second")) / 60 + now.getMilliseconds() / 60_000,
  };
}

export function todayInCanberra(now = new Date()): string {
  return canberraNow(now).date;
}

// Calendar arithmetic only: the UTC Date is a carrier for year/month/day fields,
// never an instant for Canberra midnight. This remains correct across DST days.
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days, 12)).toISOString().slice(0, 10);
}

export function isCalendarDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= "2000-01-01" && value <= "2100-12-31" && addDays(value, 0) === value;
}

export function parseTime(value: string): number | undefined {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return undefined;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function formatTime(minutes: number): string {
  return `${Math.floor(minutes / 60).toString().padStart(2, "0")}:${(minutes % 60).toString().padStart(2, "0")}`;
}

export function isFuture(date: string, minutes: number, now = new Date()): boolean {
  const current = canberraNow(now);
  return date > current.date || (date === current.date && minutes > current.minutes);
}

export function defaultSlot(now = new Date()): { date: string; start: string } {
  const current = canberraNow(now);
  const start = Math.max(OPENING_MINUTES, (Math.floor(current.minutes / 15) + 1) * 15);
  return start + 60 <= CLOSING_MINUTES
    ? { date: current.date, start: formatTime(start) }
    : { date: addDays(current.date, 1), start: formatTime(OPENING_MINUTES) };
}
