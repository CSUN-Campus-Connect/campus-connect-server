// src/components/shared/academicsApi.ts
import type { UniCartClass } from "./constants";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Mock data for local development ──────────────────────────────────────────
const MOCK_SECTIONS: UniCartClass[] = [
  { id: "1", sectionId: "15001", subject: "COMP", number: "110", title: "Intro to Algorithms", units: 3, semester: "Spring 2026", professor: "Dr. Smith", days: ["Mon", "Wed"], startTime: "09:00", endTime: "10:15", location: "JD 1600", isOnline: false, seats: 35, seatsAvailable: 12, tags: ["CS Core", "Lower Division"] },
  { id: "2", sectionId: "15002", subject: "COMP", number: "182", title: "Programming in Python", units: 3, semester: "Spring 2026", professor: "Dr. Lee", days: ["Tue", "Thu"], startTime: "11:00", endTime: "12:15", location: "JD 2200", isOnline: false, seats: 30, seatsAvailable: 5, tags: ["CS Core", "Lower Division"] },
  { id: "3", sectionId: "15003", subject: "MATH", number: "150A", title: "Calculus I", units: 4, semester: "Spring 2026", professor: "Dr. Patel", days: ["Mon", "Wed", "Fri"], startTime: "08:00", endTime: "08:50", location: "SN 323", isOnline: false, seats: 40, seatsAvailable: 20, tags: ["Lower Division"] },
  { id: "4", sectionId: "15004", subject: "ENGL", number: "115", title: "College Writing", units: 3, semester: "Spring 2026", professor: "Prof. Torres", days: ["Tue", "Thu"], startTime: "14:00", endTime: "15:15", location: "SQ 110", isOnline: false, seats: 25, seatsAvailable: 8, tags: ["GE: Basic Skills", "Lower Division"] },
  { id: "5", sectionId: "15005", subject: "COMP", number: "380", title: "Data Structures", units: 3, semester: "Spring 2026", professor: "Dr. Chen", days: ["Mon", "Wed"], startTime: "13:00", endTime: "14:15", location: "JD 1600", isOnline: false, seats: 30, seatsAvailable: 0, waitlistCount: 6, tags: ["CS Core", "Upper Division"] },
  { id: "6", sectionId: "15006", subject: "PHYS", number: "220A", title: "Physics for Engineers I", units: 4, semester: "Spring 2026", professor: "Dr. Kim", days: ["Tue", "Thu"], startTime: "09:30", endTime: "10:45", location: "SN 108", isOnline: false, seats: 35, seatsAvailable: 15, linkedLab: "15007", tags: ["Engineering Core"] },
  { id: "7", sectionId: "15007", subject: "PHYS", number: "220AL", title: "Physics Lab I", units: 1, semester: "Spring 2026", professor: "Dr. Kim", days: ["Fri"], startTime: "13:00", endTime: "15:50", location: "SN 110L", isOnline: false, seats: 20, seatsAvailable: 15, tags: ["Engineering Core"] },
  { id: "8", sectionId: "15008", subject: "BUS", number: "302", title: "Business Communications", units: 3, semester: "Spring 2026", professor: "Prof. Martinez", days: [], startTime: "", endTime: "", isOnline: true, seats: 50, seatsAvailable: 22, tags: ["Online", "Upper Division"] },
  { id: "9", sectionId: "15009", subject: "HIST", number: "111", title: "World History to 1500", units: 3, semester: "Spring 2026", professor: "Dr. Johnson", days: ["Mon", "Wed", "Fri"], startTime: "10:00", endTime: "10:50", location: "SQ 220", isOnline: false, seats: 45, seatsAvailable: 30, tags: ["GE: Humanities", "Lower Division"] },
  { id: "10", sectionId: "15010", subject: "COMP", number: "490", title: "Senior Design Project", units: 3, semester: "Spring 2026", professor: "Dr. Williams", days: ["Thu"], startTime: "16:00", endTime: "18:45", location: "JD 3300", isOnline: false, seats: 20, seatsAvailable: 4, tags: ["CS Required", "Upper Division"] },
];

export async function fetchSections(params: {
  semester?: string;
  dept?: string;
  search?: string;
  level?: string;
}): Promise<UniCartClass[]> {
  // Try real API first, fall back to mock
  try {
    const q = new URLSearchParams();
    if (params.semester) q.set("semester", params.semester);
    if (params.dept)     q.set("dept", params.dept);
    if (params.search)   q.set("search", params.search);
    if (params.level)    q.set("level", params.level);

    const res = await fetch(`${API}/api/academics/sections?${q}`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error("API error");
    return await res.json();
  } catch {
    // Filter mock data locally
    let results = [...MOCK_SECTIONS];
    if (params.dept && params.dept !== "All")
      results = results.filter(c => c.subject === params.dept);
    if (params.search)
      results = results.filter(c =>
        `${c.subject} ${c.number} ${c.title} ${c.professor}`.toLowerCase().includes(params.search!.toLowerCase())
      );
    if (params.level && params.level !== "All")
      results = results.filter(c => {
        const num = parseInt(c.number);
        const lvl = parseInt(params.level!);
        return num >= lvl && num < lvl + 100;
      });
    return results;
  }
}

export async function fetchSemesters(): Promise<string[]> {
  try {
    const res = await fetch(`${API}/api/academics/semesters`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error();
    return await res.json();
  } catch {
    return ["Spring 2026", "Fall 2026", "Summer 2026"];
  }
}

export async function fetchDepartments(): Promise<string[]> {
  try {
    const res = await fetch(`${API}/api/academics/departments`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error();
    return await res.json();
  } catch {
    return ["All", "COMP", "MATH", "ENGL", "PHYS", "BUS", "HIST", "ART", "BIOL", "CHEM", "PSYC", "KINE", "MUS", "ECE"];
  }
}

export function checkConflicts(cart: UniCartClass[]): Record<string, string[]> {
  const conflicts: Record<string, string[]> = {};
  for (let i = 0; i < cart.length; i++) {
    for (let j = i + 1; j < cart.length; j++) {
      const a = cart[i], b = cart[j];
      if (a.isOnline || b.isOnline) continue;
      const sharedDays = (a.days ?? []).filter(d => (b.days ?? []).includes(d));
      if (!sharedDays.length) continue;
      const aStart = toMin(a.startTime), aEnd = toMin(a.endTime);
      const bStart = toMin(b.startTime), bEnd = toMin(b.endTime);
      if (aStart < bEnd && aEnd > bStart) {
        conflicts[a.id] = [...(conflicts[a.id] ?? []), `${b.subject} ${b.number}`];
        conflicts[b.id] = [...(conflicts[b.id] ?? []), `${a.subject} ${a.number}`];
      }
    }
  }
  return conflicts;
}

function toMin(t: string) {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
