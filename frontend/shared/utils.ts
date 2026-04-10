// shared/utils.ts

export function fmt12(time?: string | null): string {
  if (!time) return "TBA";
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

export function timesConflict(
  days1: string[], start1: string, end1: string,
  days2: string[], start2: string, end2: string
): boolean {
  const sharedDays = days1.filter((d) => days2.includes(d));
  if (!sharedDays.length) return false;
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  return toMin(start1) < toMin(end2) && toMin(end1) > toMin(start2);
}
