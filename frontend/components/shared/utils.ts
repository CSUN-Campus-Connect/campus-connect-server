// src/components/shared/utils.ts
export function fmt12(time: string): string {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")}${period}`;
}

function toMin(t: string): number {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function timesConflict(
  daysA: string[], startA: string, endA: string,
  daysB: string[], startB: string, endB: string
): boolean {
  const sharedDays = daysA.filter(d => daysB.includes(d));
  if (!sharedDays.length) return false;
  return toMin(startA) < toMin(endB) && toMin(endA) > toMin(startB);
}
