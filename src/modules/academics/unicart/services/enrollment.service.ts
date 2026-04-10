/**
 * enrollment.service.ts
 * Cross-references catalog course data with section/schedule info.
 * Since CSUN's schedule-of-classes API requires auth, sections are
 * stored/managed here and can be seeded or updated via admin endpoints.
 * Structure mirrors what cmsweb.csun.edu would provide.
 */

import NodeCache from "node-cache";
import type { CatalogCourse } from "./catalogScraper.service";

const cache = new NodeCache({ stdTTL: 3600 });

export type DayCode = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

export interface CourseSection {
  sectionId: string;        // e.g. "01", "02L"
  courseId: string;         // e.g. "COMP-100"
  subject: string;
  number: string;
  title: string;
  units: number;
  semester: string;         // e.g. "Spring 2026"
  professor: string;
  days: DayCode[] | null;
  startTime: string | null; // "HH:MM" 24h
  endTime: string | null;
  location: string | null;
  isOnline: boolean;
  seats: number;
  seatsAvailable: number;
  waitlistCount: number;
  courseType: "Lecture" | "Lab" | "Seminar" | "Studio" | "Hybrid" | null;
  linkedLab: string | null; // section id of required lab
  materialCost: number;
  prerequisites: string[];
  tags: string[];
  description: string;
}

// ── In-memory section store (replace with DB in production) ──────────────────
// Seeded with representative CSUN-style data for demo.
// In production: populate from DB after manual import or admin API.
const sectionStore: CourseSection[] = [
  // COMP
  mkSection("COMP", "100", "Intro to CS", 3, "Spring 2026", "Dr. Smith", ["Mon","Wed"], "10:00", "11:15", "JD 1500", false, "01", 35, 8, 0, "Lecture", null, 0),
  mkSection("COMP", "100", "Intro to CS", 3, "Spring 2026", "Dr. Smith", ["Tue","Thu"], "13:00", "14:15", "JD 1500", false, "02", 35, 22, 0, "Lecture", null, 0),
  mkSection("COMP", "100", "Intro to CS", 3, "Spring 2026", "Dr. Lee",   null,          null,    null,    null,      true,  "80", 40, 15, 0, "Lecture", null, 0),
  mkSection("COMP", "182", "Programming Concepts I", 3, "Spring 2026", "Dr. Patel", ["Mon","Wed","Fri"], "09:00", "09:50", "JD 2201", false, "01", 30, 5, 3, "Lecture", "02L", 25),
  mkSection("COMP", "182", "Programming Concepts I Lab", 1, "Spring 2026", "Dr. Patel", ["Wed"], "14:00", "15:50", "JD 2204", false, "02L", 30, 5, 0, "Lab", null, 25),
  mkSection("COMP", "256", "Data Structures", 3, "Spring 2026", "Prof. Chen", ["Tue","Thu"], "09:30", "10:45", "JD 2201", false, "01", 30, 12, 0, "Lecture", null, 0),
  mkSection("COMP", "380", "Software Engineering", 3, "Spring 2026", "Dr. Kim", ["Mon","Wed"], "14:00", "15:15", "JD 3300", false, "01", 25, 3, 2, "Lecture", null, 0),
  mkSection("COMP", "490", "Senior Project", 3, "Spring 2026", "TBA", null, null, null, null, false, "01", 20, 10, 0, "Seminar", null, 0),

  // MATH
  mkSection("MATH", "102", "Intermediate Algebra", 3, "Spring 2026", "Prof. Garcia", ["Mon","Wed","Fri"], "08:00", "08:50", "SN 101", false, "01", 35, 20, 0, "Lecture", null, 0),
  mkSection("MATH", "150A", "Calculus I", 4, "Spring 2026", "Dr. Torres", ["Mon","Wed","Fri"], "10:00", "11:05", "SN 202", false, "01", 35, 14, 0, "Lecture", null, 0),
  mkSection("MATH", "250", "Calculus III", 3, "Spring 2026", "Dr. Torres", ["Tue","Thu"], "11:00", "12:15", "SN 303", false, "01", 30, 7, 0, "Lecture", null, 0),
  mkSection("MATH", "360", "Probability & Statistics", 3, "Spring 2026", "Dr. Wang", ["Mon","Wed"], "15:30", "16:45", "SN 303", false, "01", 30, 18, 0, "Lecture", null, 0),

  // PHYS
  mkSection("PHYS", "100A", "Physics I", 3, "Spring 2026", "Dr. Brown", ["Mon","Wed","Fri"], "11:00", "11:50", "EP 100", false, "01", 40, 10, 0, "Lecture", "01L", 50),
  mkSection("PHYS", "100AL", "Physics I Lab", 1, "Spring 2026", "Dr. Brown", ["Tue"], "14:00", "16:50", "EP 120", false, "01L", 24, 6, 0, "Lab", null, 50),
  mkSection("PHYS", "220A", "Modern Physics", 3, "Spring 2026", "Dr. Patel", ["Tue","Thu"], "12:30", "13:45", "EP 200", false, "01", 30, 15, 0, "Lecture", null, 0),

  // ENGL
  mkSection("ENGL", "100", "Freshman Composition", 3, "Spring 2026", "Prof. Adams", ["Mon","Wed","Fri"], "09:00", "09:50", "SH 217", false, "01", 25, 12, 0, "Lecture", null, 0),
  mkSection("ENGL", "100", "Freshman Composition", 3, "Spring 2026", "Prof. Lewis", null, null, null, null, true, "80", 25, 20, 0, "Lecture", null, 0),
  mkSection("ENGL", "370", "Technical Writing", 3, "Spring 2026", "Prof. Young", ["Tue","Thu"], "14:00", "15:15", "SH 102", false, "01", 25, 9, 0, "Lecture", null, 0),

  // ECE
  mkSection("ECE", "240", "Circuit Analysis", 3, "Spring 2026", "Dr. Hassan", ["Mon","Wed","Fri"], "13:00", "13:50", "EH 104", false, "01", 30, 5, 4, "Lecture", null, 0),
  mkSection("ECE", "350", "Signals & Systems", 3, "Spring 2026", "Dr. Liu", ["Tue","Thu"], "10:00", "11:15", "EH 204", false, "01", 25, 12, 0, "Lecture", null, 0),

  // BIOL
  mkSection("BIOL", "101", "General Biology I", 3, "Spring 2026", "Dr. Martinez", ["Mon","Wed","Fri"], "10:00", "10:50", "SB 101", false, "01", 45, 22, 0, "Lecture", "01L", 40),
  mkSection("BIOL", "101L", "General Biology I Lab", 1, "Spring 2026", "Dr. Martinez", ["Thu"], "14:00", "16:50", "SB 120", false, "01L", 24, 8, 0, "Lab", null, 40),
  mkSection("BIOL", "305", "Genetics", 3, "Spring 2026", "Dr. Wilson", ["Tue","Thu"], "09:30", "10:45", "SB 201", false, "01", 35, 4, 2, "Lecture", null, 0),

  // CHEM
  mkSection("CHEM", "101", "General Chemistry I", 3, "Spring 2026", "Dr. Park", ["Mon","Wed","Fri"], "11:00", "11:50", "SB 301", false, "01", 40, 15, 0, "Lecture", "01L", 60),
  mkSection("CHEM", "101L", "General Chemistry I Lab", 1, "Spring 2026", "Dr. Park", ["Fri"], "13:00", "16:50", "SB 320", false, "01L", 24, 7, 0, "Lab", null, 60),

  // PSYC
  mkSection("PSYC", "150", "Intro to Psychology", 3, "Spring 2026", "Dr. Robinson", ["Mon","Wed","Fri"], "12:00", "12:50", "SQ 100", false, "01", 50, 30, 0, "Lecture", null, 0),
  mkSection("PSYC", "150", "Intro to Psychology", 3, "Spring 2026", "Dr. Robinson", null, null, null, null, true, "80", 50, 40, 0, "Lecture", null, 0),

  // MUS
  mkSection("MUS", "100", "Music Appreciation", 3, "Spring 2026", "Prof. Johnson", ["Tue","Thu"], "11:00", "12:15", "MU 101", false, "01", 30, 25, 0, "Lecture", null, 0),

  // HIST
  mkSection("HIST", "101", "World History I", 3, "Spring 2026", "Prof. Thomas", ["Mon","Wed","Fri"], "08:00", "08:50", "SH 303", false, "01", 40, 18, 0, "Lecture", null, 0),
  mkSection("HIST", "101", "World History I", 3, "Spring 2026", "Prof. Thomas", null, null, null, null, true, "80", 40, 35, 0, "Lecture", null, 0),

  // SOC
  mkSection("SOC", "150", "Intro to Sociology", 3, "Spring 2026", "Dr. Green", ["Mon","Wed"], "16:00", "17:15", "SQ 201", false, "01", 35, 20, 0, "Lecture", null, 0),

  // BUS
  mkSection("BUS", "302", "Business Communications", 3, "Spring 2026", "Prof. White", ["Tue","Thu"], "15:30", "16:45", "JH 101", false, "01", 30, 8, 0, "Lecture", null, 0),

  // Fall 2026 sections (limited demo)
  mkSection("COMP", "100", "Intro to CS", 3, "Fall 2026", "Dr. Smith", ["Mon","Wed"], "10:00", "11:15", "JD 1500", false, "01", 35, 35, 0, "Lecture", null, 0),
  mkSection("COMP", "256", "Data Structures", 3, "Fall 2026", "Prof. Chen", ["Tue","Thu"], "09:30", "10:45", "JD 2201", false, "01", 30, 28, 0, "Lecture", null, 0),
  mkSection("MATH", "150A", "Calculus I", 4, "Fall 2026", "Dr. Torres", ["Mon","Wed","Fri"], "10:00", "11:05", "SN 202", false, "01", 35, 30, 0, "Lecture", null, 0),

  // Summer 2026
  mkSection("COMP", "100", "Intro to CS", 3, "Summer 2026", "Dr. Lee", null, null, null, null, true, "80", 40, 20, 0, "Lecture", null, 0),
  mkSection("MATH", "102", "Intermediate Algebra", 3, "Summer 2026", "Prof. Garcia", ["Mon","Tue","Wed","Thu"], "09:00", "10:05", "SN 101", false, "01", 25, 10, 0, "Lecture", null, 0),
];

function mkSection(
  subject: string,
  number: string,
  title: string,
  units: number,
  semester: string,
  professor: string,
  days: DayCode[] | null,
  startTime: string | null,
  endTime: string | null,
  location: string | null,
  isOnline: boolean,
  sectionId: string,
  seats: number,
  seatsAvailable: number,
  waitlistCount: number,
  courseType: "Lecture" | "Lab" | "Seminar" | "Studio" | "Hybrid" | null,
  linkedLab: string | null,
  materialCost: number,
  prerequisites: string[] = [],
  tags: string[] = [],
): CourseSection {
  const numVal = parseInt(number);
  const level = numVal < 200 ? "100s" : numVal < 300 ? "200s" : numVal < 400 ? "300s" : numVal < 500 ? "400s" : "500s";
  const baseTags = [
    subject,
    level,
    numVal >= 300 ? "Upper Division" : "Lower Division",
    isOnline ? "Online" : "In-Person",
    ...(courseType ? [courseType] : []),
    ...tags,
  ];

  return {
    sectionId,
    courseId: `${subject}-${number}`,
    subject,
    number,
    title,
    units,
    semester,
    professor,
    days,
    startTime,
    endTime,
    location,
    isOnline,
    seats,
    seatsAvailable,
    waitlistCount,
    courseType,
    linkedLab,
    materialCost,
    prerequisites,
    tags: [...new Set(baseTags)],
    description: "",
  };
}

// ── Query helpers ─────────────────────────────────────────────────────────────

export interface SectionQuery {
  semester: string;
  subject?: string;
  search?: string;
  level?: string;        // "100s" | "200s" | etc.
  days?: string[];       // e.g. ["Mon","Wed"]
  unitsMin?: number;
  unitsMax?: number;
  isOnline?: boolean;
  openOnly?: boolean;
  tag?: string;
  page?: number;
  limit?: number;
}

export function querySections(query: SectionQuery): { sections: CourseSection[]; total: number } {
  const cacheKey = JSON.stringify(query);
  const cached = cache.get<{ sections: CourseSection[]; total: number }>(cacheKey);
  if (cached) return cached;

  let list = sectionStore.filter((s) => s.semester === query.semester);

  if (query.subject) {
    const subj = query.subject.toUpperCase();
    list = list.filter((s) => s.subject === subj);
  }

  if (query.search?.trim()) {
    const q = query.search.toLowerCase();
    list = list.filter((s) =>
      `${s.subject} ${s.number} ${s.title} ${s.professor} ${s.tags.join(" ")}`
        .toLowerCase().includes(q)
    );
  }

  if (query.level) {
    list = list.filter((s) => s.tags.includes(query.level!));
  }

  if (query.days?.length) {
    list = list.filter((s) => {
      if (!s.days) return false;
      return query.days!.every((d) => s.days!.includes(d as DayCode));
    });
  }

  if (query.unitsMin !== undefined) list = list.filter((s) => s.units >= query.unitsMin!);
  if (query.unitsMax !== undefined) list = list.filter((s) => s.units <= query.unitsMax!);
  if (query.isOnline !== undefined) list = list.filter((s) => s.isOnline === query.isOnline);
  if (query.openOnly) list = list.filter((s) => s.seatsAvailable > 0);

  if (query.tag && query.tag !== "All") {
    const tag = query.tag;
    if (tag === "Online") list = list.filter((s) => s.isOnline);
    else if (tag === "In-Person") list = list.filter((s) => !s.isOnline);
    else if (tag === "Open Seats") list = list.filter((s) => s.seatsAvailable > 0);
    else if (tag === "Waitlist Available") list = list.filter((s) => s.waitlistCount > 0);
    else list = list.filter((s) => s.tags.some((t) => t.toUpperCase() === tag.toUpperCase()));
  }

  const total = list.length;
  const page = query.page ?? 1;
  const limit = query.limit ?? 50;
  const paginated = list.slice((page - 1) * limit, page * limit);

  const result = { sections: paginated, total };
  cache.set(cacheKey, result, 60); // 1 min cache for sections (availability changes)
  return result;
}

// ── Merge catalog descriptions into sections ──────────────────────────────────
export function enrichSectionsWithCatalog(
  sections: CourseSection[],
  catalogCourses: CatalogCourse[]
): CourseSection[] {
  const catalogMap = new Map(catalogCourses.map((c) => [c.id, c]));
  return sections.map((s) => {
    const cat = catalogMap.get(s.courseId);
    if (!cat) return s;
    return {
      ...s,
      description: cat.description || s.description,
      prerequisites: s.prerequisites.length ? s.prerequisites : cat.prerequisites,
      tags: [...new Set([...s.tags, ...cat.tags])],
    };
  });
}

// ── Conflict detection ────────────────────────────────────────────────────────
export function detectConflicts(sections: CourseSection[]): Map<string, string[]> {
  const conflicts = new Map<string, string[]>();

  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      const a = sections[i];
      const b = sections[j];
      if (a.isOnline || b.isOnline || !a.startTime || !b.startTime) continue;

      const sharedDays = (a.days ?? []).filter((d) => (b.days ?? []).includes(d));
      if (!sharedDays.length) continue;

      const aStart = toMinutes(a.startTime);
      const aEnd   = toMinutes(a.endTime!);
      const bStart = toMinutes(b.startTime);
      const bEnd   = toMinutes(b.endTime!);

      if (aStart < bEnd && aEnd > bStart) {
        const aKey = `${a.subject} ${a.number}`;
        const bKey = `${b.subject} ${b.number}`;
        conflicts.set(aKey, [...(conflicts.get(aKey) ?? []), bKey]);
        conflicts.set(bKey, [...(conflicts.get(bKey) ?? []), aKey]);
      }
    }
  }

  return conflicts;
}

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

// ── iCal export ───────────────────────────────────────────────────────────────
export function generateICS(sections: CourseSection[], semester: string): string {
  const semesterStartMap: Record<string, string> = {
    "Spring 2026": "20260119",
    "Fall 2026":   "20260824",
    "Summer 2026": "20260601",
    "Spring 2027": "20270120",
  };
  const semesterEndMap: Record<string, string> = {
    "Spring 2026": "20260515",
    "Fall 2026":   "20261218",
    "Summer 2026": "20260801",
    "Spring 2027": "20270514",
  };

  const dayMap: Record<string, string> = {
    Mon: "MO", Tue: "TU", Wed: "WE", Thu: "TH", Fri: "FR", Sat: "SA", Sun: "SU",
  };

  const semStart = semesterStartMap[semester] ?? "20260119";
  const semEnd   = semesterEndMap[semester]   ?? "20260515";

  let cal = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CampusConnect//UniCart//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${semester} Schedule`,
    "X-WR-TIMEZONE:America/Los_Angeles",
  ].join("\r\n");

  for (const s of sections) {
    if (s.isOnline || !s.startTime || !s.days?.length) continue;

    const rrDays = s.days.map((d) => dayMap[d]).join(",");
    const dtStart = `${semStart}T${s.startTime.replace(":", "")}00`;
    const dtEnd   = `${semStart}T${s.endTime!.replace(":", "")}00`;
    const uid     = `${s.courseId}-${s.sectionId}-${semStart}@campusconnect`;

    cal += "\r\nBEGIN:VEVENT";
    cal += `\r\nUID:${uid}`;
    cal += `\r\nSUMMARY:${s.subject} ${s.number} - ${s.title}`;
    cal += `\r\nDTSTART;TZID=America/Los_Angeles:${dtStart}`;
    cal += `\r\nDTEND;TZID=America/Los_Angeles:${dtEnd}`;
    cal += `\r\nRRULE:FREQ=WEEKLY;BYDAY=${rrDays};UNTIL=${semEnd}T235959Z`;
    cal += `\r\nLOCATION:${s.location ?? "TBA"}`;
    cal += `\r\nDESCRIPTION:Section ${s.sectionId} | Prof. ${s.professor}\\n${s.description}`;
    cal += "\r\nEND:VEVENT";
  }

  cal += "\r\nEND:VCALENDAR";
  return cal;
}

export { sectionStore };
