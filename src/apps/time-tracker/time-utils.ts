export function parseTimeToMinutes(value: string): number | null {
  const m = /^([0-1]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function formatMinutesAsTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatDurationHm(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}m`;
}

export function minutesToDecimalHours(totalMinutes: number): number {
  return Math.round((totalMinutes / 60) * 100) / 100;
}

export function hoursToMinutes(hours: number): number {
  return Math.round(hours * 60);
}

export function rangeNetMinutes(
  startMinutes: number,
  endMinutes: number,
  breakMinutes: number,
): number | null {
  if (endMinutes <= startMinutes) return null;
  return Math.max(0, endMinutes - startMinutes - breakMinutes);
}

export function hoursNetMinutes(grossMinutes: number, breakMinutes: number): number {
  return Math.max(0, grossMinutes - breakMinutes);
}
