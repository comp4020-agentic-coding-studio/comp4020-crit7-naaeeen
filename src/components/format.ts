export function displayDate(date: string, full = false): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return "Choose a valid date";
  return new Intl.DateTimeFormat("en-AU", {
    weekday: full ? "long" : "short",
    day: "numeric",
    month: full ? "long" : "short",
    timeZone: "UTC",
  }).format(parsed);
}

export function displayTime(time: string): string {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return "Choose a valid time";
  const [hours, minutes] = time.split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")}${hours >= 12 ? "pm" : "am"}`;
}

export function durationLabel(minutes: number): string {
  return minutes === 30 ? "30 minutes" : minutes === 60 ? "1 hour" : minutes === 90 ? "1.5 hours" : minutes === 120 ? "2 hours" : "Choose a valid duration";
}

export function searchParams(filters: {date: string; start: string; duration: number; people: number; library: string; kind: string; features: string[]}): URLSearchParams {
  const params = new URLSearchParams({ date: filters.date, start: filters.start, duration: String(filters.duration), people: String(filters.people) });
  if (filters.library) params.set("library", filters.library);
  if (filters.kind) params.set("kind", filters.kind);
  filters.features.forEach((feature) => params.append("features", feature));
  return params;
}

export const kindLabels: Record<string, string> = { room: "Study room", booth: "Study booth", desk: "Study desk" };

export function featureLabel(feature: string): string {
  const labels: Record<string, string> = { whiteboard: "Whiteboard", screen: "Screen", display: "Screen", power: "Power outlets", quiet: "Quiet space", accessible: "Step-free access", monitor: "Monitor", computer: "Computer", "step-free access": "Step-free access" };
  return labels[feature.toLowerCase()] ?? feature.charAt(0).toUpperCase() + feature.slice(1);
}

export function featureIcon(feature: string): string {
  const icons: Record<string, string> = { whiteboard: "whiteboard", screen: "screen", display: "screen", power: "plug", quiet: "quiet", accessible: "accessible", monitor: "screen", computer: "screen", "step-free access": "accessible" };
  return icons[feature.toLowerCase()] ?? "check";
}
