/**
 * enrollment.service.ts
 *
 * ARCHITECTURE: Scraping-free backend service.
 *
 * CSUN's WAF blocks all server-to-server requests to *.csun.edu.
 * All scraping happens in the browser (unicart.html) and results are
 * sent to the backend via POST /api/academics/ingest.
 *
 * This service:
 *   - Stores ingested sections in an in-memory cache (keyed by semester)
 *   - Filters, paginates, and returns sections via querySections()
 *   - Detects scheduling conflicts
 *   - Generates .ics calendar exports
 *
 * NO fallback data. NO hardcoded sections. If no data has been ingested
 * for a query, you get an empty array — that is the correct behavior.
 * The browser is responsible for scraping and sending real data.
 */

import NodeCache from "node-cache";
import logger from "../../../../utils/logger";
import type { CatalogCourse } from "./catalogScraper.service";
import { getCachedCoursesByDept, searchCachedCatalog } from "./catalogScraper.service";

const cache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

export type DayCode = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

export interface CourseSection {
  sectionId: string;
  courseId: string;
  subject: string;
  number: string;
  title: string;
  units: number;
  semester: string;
  professor: string;
  days: DayCode[] | null;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  isOnline: boolean;
  seats: number;
  seatsAvailable: number;
  waitlistCount: number;
  courseType: "Lecture" | "Lab" | "Seminar" | "Studio" | "Hybrid" | null;
  linkedLab: string | null;
  materialCost: number;
  prerequisites: string[];
  tags: string[];
  description: string;
}

export interface SectionQuery {
  semester: string;
  subject?: string;
  search?: string;
  level?: string;
  days?: string[];
  unitsMin?: number;
  unitsMax?: number;
  isOnline?: boolean;
  openOnly?: boolean;
  tag?: string;
  page?: number;
  limit?: number;
}

type SectionLookupParams = {
  sectionId: string;
  semester: string;
  subject?: string;
  search?: string;
};

const SUPPORTED_SEMESTERS = ["Spring 2026", "Fall 2025", "Fall 2026", "Summer 2026"];

/** Returns the semesters supported by the app. */
export function getSupportedSemesters(): string[] {
  return SUPPORTED_SEMESTERS;
}

// ── Section ingestion (called from POST /api/academics/ingest) ─────────────

/**
 * Store browser-scraped sections in cache.
 * Sections are keyed by semester so they can be retrieved by querySections().
 */
export function ingestSections(sections: CourseSection[]): number {
  if (!sections?.length) return 0;

  const bySemester = new Map<string, CourseSection[]>();
  for (const s of sections) {
    const sem = s.semester?.trim();
    if (!sem) continue;
    if (!bySemester.has(sem)) bySemester.set(sem, []);
    bySemester.get(sem)!.push(s);
  }

  let totalStored = 0;
  for (const [sem, newSections] of bySemester.entries()) {
    const key = `sections:semester:${sem}`;
    const existing = cache.get<CourseSection[]>(key) ?? [];

    // Merge: update existing by sectionId, append new
    const merged = [...existing];
    for (const s of newSections) {
      const idx = merged.findIndex(
        (e) => e.sectionId === s.sectionId && e.courseId === s.courseId
      );
      if (idx >= 0) merged[idx] = s;
      else merged.push(s);
    }

    cache.set(key, merged);
    totalStored += merged.length;
    logger.info({ semester: sem, newCount: newSections.length, totalCached: merged.length }, "Sections ingested");
  }

  // Invalidate query caches when new data arrives
  const keys = cache.keys().filter((k) => k.startsWith("sections:query:"));
  if (keys.length) cache.del(keys);

  return totalStored;
}

/**
 * Get all cached sections for a semester.
 */
function getSectionsForSemester(semester: string): CourseSection[] {
  return cache.get<CourseSection[]>(`sections:semester:${semester}`) ?? [];
}

// ── Filtering ─────────────────────────────────────────────────────────────────

/** Applies search and filter rules to section results. */
function filterSections(sections: CourseSection[], query: SectionQuery): CourseSection[] {
  let result = sections;

  if (query.subject) {
    const subj = query.subject.toUpperCase();
    result = result.filter((s) => s.subject.toUpperCase() === subj);
  }

  if (query.search?.trim()) {
    const q = query.search.trim().toLowerCase();
    // If search looks like "COMP 440" or "comp440", also match subject+number
    const subjectMatch = q.match(/^([a-z]{2,6})\s*(\d{2,3}[a-z]?)$/i);
    result = result.filter((s) => {
      const haystack = `${s.subject} ${s.number} ${s.title} ${s.courseId} ${s.description}`.toLowerCase();
      if (subjectMatch) {
        const subj = subjectMatch[1].toUpperCase();
        const num  = subjectMatch[2].toUpperCase();
        if (s.subject.toUpperCase() === subj && s.number.toUpperCase().startsWith(num)) return true;
      }
      return haystack.includes(q);
    });
  }

  if (query.level) {
    result = result.filter((s) => s.tags.includes(query.level!));
  }

  if (query.days?.length) {
    result = result.filter((s) => {
      if (!s.days) return false;
      return query.days!.every((d) => s.days!.includes(d as DayCode));
    });
  }

  if (query.unitsMin !== undefined) result = result.filter((s) => s.units >= query.unitsMin!);
  if (query.unitsMax !== undefined) result = result.filter((s) => s.units <= query.unitsMax!);

  if (query.isOnline !== undefined) {
    result = result.filter((s) => s.isOnline === query.isOnline);
  }

  if (query.openOnly) {
    result = result.filter((s) => s.seatsAvailable > 0);
  }

  if (query.tag && query.tag !== "All") {
    const tag = query.tag;
    if (tag === "Online")         result = result.filter((s) => s.isOnline);
    else if (tag === "In-Person") result = result.filter((s) => !s.isOnline);
    else if (tag === "Open Seats") result = result.filter((s) => s.seatsAvailable > 0);
    else result = result.filter((s) =>
      s.tags.some((t) => t.toUpperCase() === tag.toUpperCase())
    );
  }

  return result;
}

// ── Public query API ──────────────────────────────────────────────────────────

/** Returns filtered and paginated sections for a query. */
export async function querySections(
  query: SectionQuery
): Promise<{ sections: CourseSection[]; total: number }> {
  const cacheKey = `sections:query:${JSON.stringify(query)}`;
  const cached = cache.get<{ sections: CourseSection[]; total: number }>(cacheKey);
  if (cached) return cached;

  const allSections = getSectionsForSemester(query.semester);
  const filtered = filterSections(allSections, query);

  const total = filtered.length;
  const page  = query.page  ?? 1;
  const limit = query.limit ?? 50;
  const paginated = filtered.slice((page - 1) * limit, page * limit);

  const result = { sections: paginated, total };
  cache.set(cacheKey, result, 60); // Short TTL — ingest invalidates this
  return result;
}

/** Finds one section by section id inside a semester. */
export async function findSectionById(
  params: SectionLookupParams
): Promise<CourseSection | null> {
  const all = getSectionsForSemester(params.semester);
  return all.find((s) => s.sectionId === params.sectionId) ?? null;
}

/** Adds catalog details like descriptions and prereqs to sections. */
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

/** Finds time overlaps between in-person class sections. */
export function detectConflicts(sections: CourseSection[]): Map<string, string[]> {
  const conflicts = new Map<string, string[]>();
  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      const a = sections[i], b = sections[j];
      if (a.isOnline || b.isOnline || !a.startTime || !b.startTime) continue;
      const sharedDays = (a.days ?? []).filter((d) => (b.days ?? []).includes(d));
      if (!sharedDays.length) continue;
      const aStart = toMinutes(a.startTime), aEnd = toMinutes(a.endTime!);
      const bStart = toMinutes(b.startTime), bEnd = toMinutes(b.endTime!);
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

/** Converts an HH:MM time string into total minutes. */
function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

// ── ICS export ────────────────────────────────────────────────────────────────

/** Builds an ICS calendar file for the selected sections. */
export function generateICS(sections: CourseSection[], semester: string): string {
  const semesterStartMap: Record<string, string> = {
    "Spring 2026": "20260119",
    "Summer 2026": "20260601",
    "Fall 2025":   "20250825",
    "Fall 2026":   "20260824",
  };
  const semesterEndMap: Record<string, string> = {
    "Spring 2026": "20260515",
    "Summer 2026": "20260731",
    "Fall 2025":   "20251219",
    "Fall 2026":   "20261218",
  };
  const dayMap: Record<string, string> = {
    Mon: "MO", Tue: "TU", Wed: "WE", Thu: "TH",
    Fri: "FR", Sat: "SA", Sun: "SU",
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
    if (s.isOnline || !s.startTime || !s.endTime || !s.days?.length) continue;
    const rrDays  = s.days.map((d) => dayMap[d]).join(",");
    const dtStart = `${semStart}T${s.startTime.replace(":", "")}00`;
    const dtEnd   = `${semStart}T${s.endTime.replace(":", "")}00`;
    const uid     = `${s.courseId}-${s.sectionId}-${semStart}@campusconnect`;
    cal += "\r\nBEGIN:VEVENT";
    cal += `\r\nUID:${uid}`;
    cal += `\r\nSUMMARY:${s.subject} ${s.number} - ${s.title}`;
    cal += `\r\nDTSTART;TZID=America/Los_Angeles:${dtStart}`;
    cal += `\r\nDTEND;TZID=America/Los_Angeles:${dtEnd}`;
    cal += `\r\nRRULE:FREQ=WEEKLY;BYDAY=${rrDays};UNTIL=${semEnd}T235959Z`;
    cal += `\r\nLOCATION:${s.location ?? "TBA"}`;
    cal += `\r\nDESCRIPTION:Section ${s.sectionId} | ${s.professor}\n${s.description}`;
    cal += "\r\nEND:VEVENT";
  }

  cal += "\r\nEND:VCALENDAR";
  return cal;
}
