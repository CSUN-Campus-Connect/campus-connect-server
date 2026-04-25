/**
 * unicart.service.ts  v5
 *
 * KEY CHANGE from v4:
 *   Section data is now fetched from the CSUN Curriculum JSON API:
 *     https://www.csun.edu/web-dev/api/curriculum/2.0/classes/{dept}
 *     https://www.csun.edu/web-dev/api/curriculum/2.0/classes/{dept-coursenum}
 *   The catalog HTML page tables are EMPTY shells populated by client-side JS —
 *   server-side scraping of those tables will always return 0 rows.
 *
 * SCRAPE HIERARCHY:
 *
 *   1. Departments
 *      GET https://www.csun.edu/web-dev/api/curriculum/2.0/departments  (primary)
 *      GET https://catalog.csun.edu/                                    (fallback scrape)
 *      Static list                                                       (last resort)
 *
 *   2. Courses for a department  (catalog HTML — this part IS static HTML, works fine)
 *      GET https://catalog.csun.edu/academics/{slug}/courses/
 *      Merged with curriculum API metadata for descriptions/prereqs
 *
 *   3. Sections (CURRICULUM API — not catalog HTML)
 *      GET https://www.csun.edu/web-dev/api/curriculum/2.0/classes/{dept-coursenum}
 *        e.g. /classes/comp-440  → sections for COMP 440
 *             /classes/comp      → all COMP sections (used when no specific course)
 *      Filtered by semester term label
 *
 * NO proxy, NO ingest, NO browser scraping for section data.
 */

import logger from "../../../../utils/logger";

// ── Tiny TTL cache ────────────────────────────────────────────────────────────
class TTLCache<T> {
  private m = new Map<string, { v: T; exp: number }>();
  constructor(private ttlMs: number, private max = 500) {}
  get(k: string): T | undefined {
    const h = this.m.get(k);
    if (!h) return undefined;
    if (Date.now() > h.exp) { this.m.delete(k); return undefined; }
    return h.v;
  }
  set(k: string, v: T) {
    if (this.m.size >= this.max) {
      const first = this.m.keys().next().value;
      if (first) this.m.delete(first);
    }
    this.m.set(k, { v, exp: Date.now() + this.ttlMs });
  }
  has(k: string): boolean { return this.get(k) !== undefined; }
}

const htmlCache = new TTLCache<string>(90 * 60_000, 400); // 90 min
const jsonCache = new TTLCache<any>(15 * 60_000, 600);    // 15 min

const CATALOG = "https://catalog.csun.edu";
const CURRIC  = "https://www.csun.edu/web-dev/api/curriculum/2.0";

// ── HTTP helpers ─────────────────────────────────────────────────────────────

const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function fetchText(url: string, timeoutMs = 20_000): Promise<string> {
  const cached = htmlCache.get(url);
  if (cached) return cached;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
      },
      signal: ctrl.signal,
      redirect: "follow",
    });
    if (!res.ok) {
      const deny = res.headers.get("x-deny-reason") ?? "";
      throw new Error(`HTTP ${res.status}${deny ? ` [${deny}]` : ""} — ${url}`);
    }
    const text = await res.text();
    if (text.length > 100) htmlCache.set(url, text);
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson<T>(url: string, timeoutMs = 15_000): Promise<T> {
  const cached = jsonCache.get(url);
  if (cached) return cached as T;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "Accept": "application/json", "User-Agent": BROWSER_UA },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
    const data = (await res.json()) as T;
    jsonCache.set(url, data);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// ── HTML parsing utilities (no DOM in Node) ───────────────────────────────────

/** Strip all HTML tags and decode common entities */
function stripTags(s: string): string {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#\d+;/g, " ")
    .replace(/\s{2,}/g, " ").trim();
}

/** Find all matches of a pattern, returning full match + capture groups */
function matchAll(str: string, re: RegExp): RegExpExecArray[] {
  const results: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  const flag = re.global ? re : new RegExp(re.source, (re.flags || "") + "g");
  while ((m = flag.exec(str)) !== null) results.push(m);
  return results;
}

function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Public types ─────────────────────────────────────────────────────────────

export type DayCode = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

export interface Department {
  code:  string; // "COMP"
  label: string; // "Computer Science"
  slug:  string; // "comp"
}

export interface CourseListing {
  courseKey:     string; // "COMP-440"
  subject:       string; // "COMP"
  number:        string; // "440"
  slug:          string; // "comp-440"
  title:         string;
  units:         number;
  description:   string;
  prerequisites: string;
  url:           string;
}

export interface ClassSection {
  classNumber: string;
  location:    string;
  days:        DayCode[];
  startTime:   string | null;
  endTime:     string | null;
  isOnline:    boolean;
  rawDays:     string;
  rawTime:     string;
  instructor:  string;
  enrolled:    number;
  enrollMax:   number;
  waitlisted:  number;
}

export interface CourseWithSections extends CourseListing {
  semester: string;
  sections: ClassSection[];
}

export interface SectionSearchResult extends CourseListing {
  semester: string;
  sections: ClassSection[];
  tags:     string[];
}

export interface CartEntry {
  courseKey: string; subject: string; number: string; title: string; units: number;
  sectionId: string;
  days: DayCode[]; startTime: string | null; endTime: string | null;
  location: string; isOnline: boolean;
}

// ── Semesters ─────────────────────────────────────────────────────────────────

const SEMESTERS = ["Spring 2026", "Fall 2025", "Fall 2026", "Summer 2026"];
export const getSupportedSemesters = () => [...SEMESTERS];

/**
 * Convert "Spring 2026" → API term strings the curriculum API understands.
 * The API accepts: "Spring-2026", "Fall-2025", etc.
 */
function semesterToApiTerm(semester: string): string {
  return semester.trim().replace(/\s+/, "-");
}

// ── STEP 1: Departments ───────────────────────────────────────────────────────

export async function fetchDepartments(): Promise<Department[]> {
  // Strategy A: curriculum JSON API (fast and reliable if accessible)
  try {
    const data = await fetchJson<any>(`${CURRIC}/departments`);
    const raw: any[] = data?.departments ?? data?.data ?? data?.results ?? [];
    if (raw.length > 5) {
      const depts = raw
        .map((d: any) => {
          const code  = String(d.dept_abbrev ?? d.abbreviation ?? d.code ?? "").toUpperCase().trim();
          const label = String(d.dept_name ?? d.name ?? d.label ?? code).trim();
          const slug  = code.toLowerCase();
          return { code, label, slug };
        })
        .filter(d => d.code.length >= 2 && d.code.length <= 8);
      if (depts.length > 5) {
        logger.info({ count: depts.length }, "fetchDepartments: from curriculum API");
        return depts;
      }
    }
  } catch (err: any) {
    logger.warn({ err: err.message }, "fetchDepartments: curriculum API failed, trying catalog scrape");
  }

  // Strategy B: scrape catalog.csun.edu homepage
  try {
    const html = await fetchText(`${CATALOG}/`);
    const depts = parseDepartmentsFromHomepage(html);
    if (depts.length > 5) {
      logger.info({ count: depts.length }, "fetchDepartments: scraped catalog homepage");
      return depts;
    }
  } catch (err: any) {
    logger.warn({ err: err.message }, "fetchDepartments: homepage scrape failed");
  }

  // Strategy C: static fallback
  logger.warn("fetchDepartments: using static fallback");
  return FALLBACK_DEPTS;
}

function parseDepartmentsFromHomepage(html: string): Department[] {
  const depts: Department[] = [];
  const seen = new Set<string>();

  const linkRe = /<a[^>]+href="\/academics\/([a-z][a-z0-9-]{1,30})\/(?:overview|courses|programs|faculty)?\/?(?:#[^"]*)?"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;

  while ((m = linkRe.exec(html)) !== null) {
    const slug  = m[1].toLowerCase();
    const label = stripTags(m[2]).replace(/\s+/g, " ").trim();

    if (!label || label.length > 80 || label.length < 2) continue;
    if (/^(overview|programs|faculty|courses|resources|introduction|a to z)/i.test(label)) continue;
    if (seen.has(slug)) continue;
    seen.add(slug);

    const code = slugToCode(slug);
    depts.push({ code, label, slug });
  }

  return depts;
}

function slugToCode(slug: string): string {
  if (slug.length <= 6 && !slug.includes("-")) return slug.toUpperCase();

  const SLUG_CODE: Record<string, string> = {
    "accounting":                "ACCT",
    "africana-studies":          "AFRS",
    "anthropology":              "ANTH",
    "art":                       "ART",
    "biology":                   "BIOL",
    "chemistry":                 "CHEM",
    "civil-engineering":         "CE",
    "civil-engineering-and-construction-management": "CE",
    "communication-disorders-and-sciences": "CDIS",
    "communication-studies":     "COMS",
    "computer-science":          "COMP",
    "criminology-and-justice-studies": "CJS",
    "deaf-studies":              "DS",
    "economics":                 "ECON",
    "education":                 "EDUC",
    "electrical-and-computer-engineering": "ECE",
    "english":                   "ENGL",
    "environmental-science":     "ENST",
    "geography-and-environmental-studies": "GEOG",
    "geological-sciences":       "GEOL",
    "health-sciences":           "HS",
    "history":                   "HIST",
    "kinesiology":               "KINE",
    "mathematics":               "MATH",
    "mechanical-engineering":    "ME",
    "music":                     "MUS",
    "nursing":                   "NURS",
    "philosophy":                "PHIL",
    "physical-therapy":          "PT",
    "physics-and-astronomy":     "PHYS",
    "political-science":         "POLS",
    "psychology":                "PSYC",
    "public-administration":     "PADM",
    "sociology":                 "SOC",
    "social-work":               "SW",
  };

  if (SLUG_CODE[slug]) return SLUG_CODE[slug];
  return slug.split("-").map(p => p[0]?.toUpperCase() ?? "").join("").slice(0, 6) || slug.toUpperCase().slice(0, 6);
}

// ── STEP 2: Courses for a department ─────────────────────────────────────────
//
// URL: https://catalog.csun.edu/academics/{slug}/courses/
// This page IS static HTML — course listing works fine via scraping.

export async function fetchDeptCourses(dept: string): Promise<CourseListing[]> {
  const slug  = dept.toLowerCase().trim().replace(/\s+/g, "-");
  const upper = dept.toUpperCase().trim();
  const url   = `${CATALOG}/academics/${slug}/courses/`;

  // fetchText throws if catalog.csun.edu is unreachable or blocks the request
  // (common in Docker/server environments). Catch and fall back to empty list
  // so the caller can still try the curriculum API directly.
  let html = "";
  try {
    html = await fetchText(url);
  } catch (err: any) {
    logger.warn({ dept: upper, url, err: err.message }, "fetchDeptCourses: catalog HTML fetch failed, falling back to curriculum API only");
  }

  const curricMap = await fetchCurriculumMeta(slug, upper).catch(() => new Map());

  if (!html) {
    // No catalog HTML — build stubs from curriculum API metadata so sections
    // can still be fetched via the API fallback in fetchCourseSections.
    const stubs: CourseListing[] = [];
    for (const [courseKey, meta] of curricMap) {
      const [subj, ...rest] = courseKey.split("-");
      const number = rest.join("-");
      if (!subj || !number) continue;
      stubs.push({
        courseKey,
        subject: subj,
        number,
        slug: courseKey.toLowerCase(),
        title: `${subj} ${number}`,
        units: meta.units,
        description: meta.description,
        prerequisites: meta.prerequisites,
        url: `${CATALOG}/academics/${slug}/courses/${courseKey.toLowerCase()}/`,
      });
    }
    logger.info({ dept: upper, count: stubs.length }, "fetchDeptCourses: built stubs from curriculum API");
    return stubs;
  }

  const courses = parseCourseListPage(html, slug, curricMap);
  logger.info({ dept: upper, count: courses.length, url }, "fetchDeptCourses done");
  return courses;
}

async function fetchCurriculumMeta(
  slug: string,
  upper: string,
): Promise<Map<string, { units: number; description: string; prerequisites: string }>> {
  const map = new Map<string, { units: number; description: string; prerequisites: string }>();
  try {
    const urls = [
      `${CURRIC}/courses/${slug}`,
      `${CURRIC}/courses/${upper.toLowerCase()}`,
    ];
    let raw: any[] = [];
    for (const u of urls) {
      try {
        const data = await fetchJson<any>(u);
        raw = data?.courses ?? data?.data ?? data?.results ?? [];
        if (raw.length) break;
      } catch { /* try next */ }
    }

    for (const c of raw) {
      const num = String(c.catalog_number ?? c.catalog ?? c.number ?? "").trim().toUpperCase();
      const subj = String(c.subject ?? c.dept_abbrev ?? upper).trim().toUpperCase();
      if (!num) continue;
      map.set(`${subj}-${num}`, {
        units:         c.units != null ? Number(c.units) : 3,
        description:   String(c.description ?? c.catalog_description ?? c.courseDescription ?? "").trim(),
        prerequisites: String(c.prerequisites ?? c.prereqs ?? c.prerequisite ?? "").trim(),
      });
    }
  } catch { /* non-fatal */ }
  return map;
}

function parseCourseListPage(
  html: string,
  deptSlug: string,
  curricMap: Map<string, { units: number; description: string; prerequisites: string }>,
): CourseListing[] {
  const courses: CourseListing[] = [];
  const seen = new Set<string>();

  // Collapse whitespace but keep tag boundaries intact
  const flat = html.replace(/\r?\n/g, " ").replace(/\t/g, " ").replace(/\s{2,}/g, " ");

  // ── STRATEGY 1: Extract every <a href="/academics/{dept}/courses/{slug}/"> link ──
  //
  // The actual CSUN catalog HTML for courses looks like:
  //   <h3><a href="/academics/comp/courses/comp-440/">COMP 440. Database Design (3)</a></h3>
  //   <p>Prerequisites: ... Description text...</p>
  //
  // We scan for ALL matching course links directly (much more reliable than
  // trying to parse <h3> blocks with lookaheads on a large page).

  const courseLinkRe = /<a\s[^>]*href="(\/academics\/[^"]+\/courses\/([^"/?#]+)\/?)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;

  while ((m = courseLinkRe.exec(flat)) !== null) {
    const href       = m[1];
    const courseSlug = m[2].toLowerCase().trim();
    const rawText    = stripTags(m[3]).replace(/\s+/g, " ").trim();

    // Skip nav/utility links (no course-number pattern in text)
    if (!rawText || seen.has(courseSlug)) continue;
    // Must look like "SUBJ 123. Title..." or "SUBJ 123/L. Title..."
    const courseM = rawText.match(
      /^([A-Z]{1,6})\s+([0-9]+[A-Z0-9\/\-]*)\.\s+(.*?)\s*(?:\((\d+(?:[\/\-]\d+)?(?:-\d+)?)\))?\s*$/i,
    );
    if (!courseM) continue;

    seen.add(courseSlug);

    const subject   = courseM[1].toUpperCase();
    const number    = courseM[2].toUpperCase();
    const title     = courseM[3].trim();
    const unitsRaw  = courseM[4] ?? "3";
    const units     = parseInt(unitsRaw.split(/[\/\-]/)[0], 10) || 3;
    const courseKey = `${subject}-${number}`;

    // Grab description from the <p> immediately following this link's <h3>
    // by finding the link's position and scanning forward for the next <p>
    const afterLink = flat.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 2000);
    const firstP    = afterLink.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const descRaw   = firstP ? stripTags(firstP[1]).replace(/\s+/g, " ").trim() : "";

    let description   = descRaw;
    let prerequisites = "";
    const prereqM = descRaw.match(/^((?:Pre|Co)requisite[^.]*\.)\s*(.*)/i);
    if (prereqM) {
      prerequisites = prereqM[1].replace(/^(?:Pre|Co)requisite[s]?:\s*/i, "").replace(/\.$/, "").trim();
      description   = prereqM[2].trim();
    }

    const meta = curricMap.get(courseKey)
      ?? curricMap.get(`${subject}-${number.replace(/[^0-9A-Z]/g, "")}`);

    courses.push({
      courseKey, subject, number, slug: courseSlug, title,
      units:         meta?.units         ?? units,
      description:   meta?.description   || description,
      prerequisites: meta?.prerequisites || prerequisites,
      url: `${CATALOG}${href.endsWith("/") ? href : href + "/"}`,
    });
  }

  if (courses.length > 0) {
    logger.info({ deptSlug, count: courses.length }, "parseCourseListPage: strategy1 (direct link scan)");
  } else {
    logger.warn({ deptSlug }, "parseCourseListPage: strategy1 found nothing, check catalog HTML structure");
  }

  courses.sort((a, b) => {
    const na = parseInt(a.number, 10) || 0;
    const nb = parseInt(b.number, 10) || 0;
    return na !== nb ? na - nb : a.number.localeCompare(b.number);
  });

  return courses;
}

// ── STEP 3: Sections via CSUN Curriculum API ──────────────────────────────────
//
// The catalog HTML course detail page (/academics/comp/courses/comp-440/) contains
// EMPTY table shells — rows are populated by client-side JavaScript. Server-side
// fetching always returns 0 data rows. DO NOT use catalog HTML for sections.
//
// Instead, use the official CSUN Curriculum JSON API:
//   GET https://www.csun.edu/web-dev/api/curriculum/2.0/classes/{dept}
//     → all sections for a department (e.g. /classes/comp)
//   GET https://www.csun.edu/web-dev/api/curriculum/2.0/classes/{dept-coursenum}
//     → sections for a specific course (e.g. /classes/comp-440)
//
// Response shape (from CSUN API docs):
// {
//   "classes": [
//     {
//       "class_number": "12345",
//       "subject": "COMP",
//       "catalog_number": "440",
//       "title": "Software Engineering",
//       "units": "3",
//       "section": "01",
//       "instructor": "Last, First",
//       "days": "MW",          // "MW", "TuTh", "F", "Online", "TBA"
//       "start_time": "1000h", // 24h-ish: "1000h"=10:00, "1330h"=13:30
//       "end_time": "1115h",
//       "location": "JD 1600",
//       "term": "Spring-2026",
//       "enrollment_current": 28,
//       "enrollment_max": 35,
//       "waitlisted": 0,
//       ...
//     }
//   ]
// }

function buildAllowedCourseLabels(course: CourseListing): Set<string> {
  const allowed = new Set<string>();
  const subject = normalizeCourseToken(course.subject);
  const normNum = normalizeCourseToken(course.number);
  const baseNum = (course.number.match(/\d+/)?.[0] || "").toUpperCase();
  allowed.add(`${subject}${normNum}`);
  if (baseNum) allowed.add(`${subject}${baseNum}`);
  if (course.number.includes("/")) {
    const slashPart = course.number.split("/").pop()?.replace(/[^A-Za-z0-9]/g, "").toUpperCase() || "";
    if (baseNum && slashPart) allowed.add(`${subject}${baseNum}${slashPart}`);
  }
  return allowed;
}

function normalizeCatalogDayText(raw: string): string {
  return String(raw || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, "")
    .replace(/mon/gi, "Mo")
    .replace(/tue/gi, "Tu")
    .replace(/wed/gi, "We")
    .replace(/thu/gi, "Th")
    .replace(/fri/gi, "Fr")
    .replace(/sat/gi, "Sa")
    .replace(/sun/gi, "Su");
}

function normalizeCatalogTimeText(raw: string): string {
  return String(raw || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/[−–—]/g, "-")
    .replace(/\s+/g, "")
    .replace(/a\.m\.?/gi, "am")
    .replace(/p\.m\.?/gi, "pm")
    .trim();
}

function parseCatalogTimeRange(raw: string): { startTime: string | null; endTime: string | null } {
  const clean = normalizeCatalogTimeText(raw).toLowerCase();
  if (!clean || /^(tba|arr|online|async)/i.test(clean)) return { startTime: null, endTime: null };
  const m = clean.match(/(\d{1,2})(?::(\d{2}))?(am|pm)-(\d{1,2})(?::(\d{2}))?(am|pm)/i);
  if (!m) return { startTime: null, endTime: null };
  const to24 = (hh: string, mm: string | undefined, mer: string) => {
    let h = Number(hh);
    const mins = Number(mm ?? "00");
    const ap = mer.toLowerCase();
    if (ap === "pm" && h !== 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
  };
  return { startTime: to24(m[1], m[2], m[3]), endTime: to24(m[4], m[5], m[6]) };
}

function parseSectionsFromCatalogHtml(html: string, semester: string, course: CourseListing): ClassSection[] {
  const flat = html.replace(/\r?\n/g, " ").replace(/\t/g, " ").replace(/\s{2,}/g, " ");
  const semLabel = semester.replace(/\s+/g, "-");
  const semRe = new RegExp(`${escRe(semLabel)}\\s*-\\s*<a[^>]*>\\s*Schedule of Classes\\s*<\\/a>`, "ig");
  const matches = matchAll(flat, semRe);
  if (!matches.length) return [];

  const slices: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index ?? 0;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? flat.length) : flat.length;
    slices.push(flat.slice(start, end));
  }

  const allowedLabels = buildAllowedCourseLabels(course);
  const sections: ClassSection[] = [];
  const seen = new Set<string>();

  for (const slice of slices) {
    const tableRe = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    let tm: RegExpExecArray | null;
    while ((tm = tableRe.exec(slice)) !== null) {
      const tableHtml = tm[0];
      const prefix = slice.slice(Math.max(0, (tm.index ?? 0) - 500), tm.index ?? 0);
      const labelMatches = matchAll(prefix, />([A-Z]{2,6}\s+\d+[A-Z0-9\/-]*)</g);
      const rawLabel = labelMatches.length ? labelMatches[labelMatches.length - 1][1] : `${course.subject} ${course.number}`;
      const normLabel = normalizeCourseToken(rawLabel);
      if (allowedLabels.size && !allowedLabels.has(normLabel)) continue;

      const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let rm: RegExpExecArray | null;
      while ((rm = rowRe.exec(tableHtml)) !== null) {
        const cellMatches = matchAll(rm[1], /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi).map(x => stripTags(x[1]).replace(/\s+/g, " ").trim());
        if (cellMatches.length < 4) continue;
        if (/class number/i.test(cellMatches[0])) continue;

        const classNumber = cellMatches[0].trim();
        if (!/^\d{4,8}$/.test(classNumber)) continue;

        const location = cellMatches[1].trim() || "TBA";
        const rawDays = normalizeCatalogDayText(cellMatches[2].trim());
        const rawTime = normalizeCatalogTimeText(cellMatches[3].trim());
        const isOnline = /^(online|async|internet|web|remote|off.?campus)/i.test(location) || /^(online|async|internet)/i.test(rawDays);
        const { startTime, endTime } = parseCatalogTimeRange(rawTime);
        const days = isOnline ? [] : parseDays(rawDays);
        const key = `${normLabel}-${classNumber}`;
        if (seen.has(key)) continue;
        seen.add(key);

        sections.push({
          classNumber,
          location,
          days,
          startTime,
          endTime,
          isOnline,
          rawDays,
          rawTime,
          instructor: "TBA",
          enrolled: 0,
          enrollMax: 0,
          waitlisted: 0,
        });
      }
    }
  }

  return sections;
}

export async function fetchCourseSections(
  course: CourseListing,
  semester: string,
): Promise<CourseWithSections> {
  // 1. Prefer the catalog course detail page HTML because it contains the semester tables
  //    the user wants to mirror exactly.
  try {
    const html = await fetchText(course.url);
    const enrichedCourse = enrichCourseFromPageHtml(course, html);
    const htmlSections = parseSectionsFromCatalogHtml(html, semester, enrichedCourse);
    if (htmlSections.length > 0) {
      logger.info({ course: enrichedCourse.courseKey, semester, count: htmlSections.length, url: course.url }, "fetchCourseSections done (catalog html)");
      return { ...enrichedCourse, semester, sections: htmlSections };
    }
    logger.warn({ course: course.courseKey, semester, url: course.url }, "fetchCourseSections: catalog html returned 0 rows, trying curriculum API fallback");
  } catch (err: any) {
    logger.warn({ course: course.courseKey, semester, url: course.url, err: err.message }, "fetchCourseSections: catalog html failed, trying curriculum API fallback");
  }

  // 2. Fallback to the curriculum API
  const term    = semesterToApiTerm(semester);
  const apiSlug = `${course.subject.toLowerCase()}-${course.number.toLowerCase().replace(/[^0-9a-z]/g, "")}`;
  const termUrl    = `${CURRIC}/terms/${term}/classes/${apiSlug}`;
  const genericUrl = `${CURRIC}/classes/${apiSlug}`;

  let rawClasses: any[] = [];
  try {
    const data = await fetchJson<any>(termUrl);
    rawClasses = data?.classes ?? data?.data ?? data?.results ?? [];
    logger.info({ url: termUrl, count: rawClasses.length }, "fetchCourseSections: term API");
  } catch (err: any) {
    logger.warn({ url: termUrl, err: err.message }, "fetchCourseSections: term API failed, trying generic");
    try {
      const data = await fetchJson<any>(genericUrl);
      rawClasses = data?.classes ?? data?.data ?? data?.results ?? [];
      logger.info({ url: genericUrl, count: rawClasses.length }, "fetchCourseSections: generic API");
    } catch (err2: any) {
      logger.warn({ url: genericUrl, err: (err2 as any).message }, "fetchCourseSections: both API endpoints failed");
      return { ...course, semester, sections: [] };
    }
  }

  const rows = rawClasses.filter((c: any) => {
    const t = String(c.term ?? c.semester ?? "").trim();
    if (!t) return false;
    const tNorm = t.replace(/\s+/g, "-").toLowerCase();
    return tNorm === term.toLowerCase();
  });

  const sections: ClassSection[] = rows.map((c: any) => {
    const meeting = extractSectionMeeting(c);

    return {
      classNumber: String(c.class_number ?? c.classNumber ?? c.class_num ?? c.section ?? c.id ?? "").trim(),
      location: meeting.location,
      days: meeting.days,
      startTime: meeting.startTime,
      endTime: meeting.endTime,
      isOnline: meeting.isOnline,
      rawDays: meeting.rawDays,
      rawTime: meeting.rawTime,
      instructor:  String(c.instructor ?? c.faculty ?? c.instructor_name ?? "TBA").trim(),
      enrolled:    Number(c.enrollment_current ?? c.enrolled ?? c.enrollment ?? 0),
      enrollMax:   Number(c.enrollment_max     ?? c.capacity ?? c.enrollment_cap ?? 0),
      waitlisted:  Number(c.waitlisted         ?? c.waitlist ?? 0),
    };
  }).filter(s => s.classNumber !== "");

  logger.info({ course: course.courseKey, semester, count: sections.length, url: course.url }, "fetchCourseSections done (api fallback)");
  return { ...course, semester, sections };
}

/**
 * Parse CSUN curriculum API time format.
 * Examples: "1000h" → "10:00", "1330h" → "13:30", "900h" → "09:00"
 * Also handles ISO-ish: "10:00", "10:00 AM"
 */
function parseApiTime(raw: string): string | null {
  const clean = String(raw || "").trim();
  if (!clean || /^(tba|arr|to be|n\/a|online|async)/i.test(clean)) return null;

  // "1000h" or "1000" (4-digit 24h military)
  const mh = clean.match(/^(\d{3,4})h?$/i);
  if (mh) {
    const n   = mh[1].padStart(4, "0");
    const hh  = n.slice(0, 2);
    const mm  = n.slice(2);
    return `${hh}:${mm}`;
  }

  // "8:30am" or "08:30 AM" or "8am"
  const mampm = clean.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (mampm) {
    let h = parseInt(mampm[1], 10);
    const mn = mampm[2] ?? "00";
    const p  = mampm[3].toLowerCase();
    if (p === "pm" && h !== 12) h += 12;
    if (p === "am" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${mn}`;
  }

  // "HH:MM" already formatted
  const mcolon = clean.match(/^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/i);
  if (mcolon) {
    let h = parseInt(mcolon[1], 10);
    const mn = mcolon[2];
    const p  = (mcolon[3] ?? "").toLowerCase();
    if (p === "pm" && h !== 12) h += 12;
    if (p === "am" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${mn}`;
  }

  return null;
}

function firstNonEmpty(...vals: any[]): string {
  for (const v of vals) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return "";
}

function collectMeetingCandidates(row: any): any[] {
  const direct = [
    row,
    ...(Array.isArray(row?.meetings) ? row.meetings : []),
    ...(Array.isArray(row?.meeting_patterns) ? row.meeting_patterns : []),
    ...(Array.isArray(row?.meetingPatterns) ? row.meetingPatterns : []),
    ...(Array.isArray(row?.class_meetings) ? row.class_meetings : []),
    ...(Array.isArray(row?.classMeetings) ? row.classMeetings : []),
    ...(Array.isArray(row?.schedule) ? row.schedule : []),
  ];

  const nestedSections = [
    ...(Array.isArray(row?.sections) ? row.sections : []),
    ...(Array.isArray(row?.classes) ? row.classes : []),
  ];
  for (const sec of nestedSections) {
    direct.push(sec);
    if (Array.isArray(sec?.meetings)) direct.push(...sec.meetings);
    if (Array.isArray(sec?.meeting_patterns)) direct.push(...sec.meeting_patterns);
    if (Array.isArray(sec?.meetingPatterns)) direct.push(...sec.meetingPatterns);
    if (Array.isArray(sec?.class_meetings)) direct.push(...sec.class_meetings);
    if (Array.isArray(sec?.classMeetings)) direct.push(...sec.classMeetings);
    if (Array.isArray(sec?.schedule)) direct.push(...sec.schedule);
  }

  return direct.filter(Boolean);
}

function extractSectionMeeting(row: any): {
  rawDays: string;
  rawTime: string;
  startTime: string | null;
  endTime: string | null;
  location: string;
  isOnline: boolean;
  days: DayCode[];
} {
  const meetings = collectMeetingCandidates(row);

  let best: any = row;
  let bestScore = -1;
  for (const m of meetings) {
    const days = firstNonEmpty(m?.days, m?.day, m?.meeting_days, m?.meetingDays, m?.mtg_days, m?.pattern);
    const start = firstNonEmpty(m?.start_time, m?.startTime, m?.begin_time, m?.beginTime, m?.from_time, m?.fromTime);
    const end = firstNonEmpty(m?.end_time, m?.endTime, m?.finish_time, m?.finishTime, m?.to_time, m?.toTime);
    const location = firstNonEmpty(m?.location, m?.room, m?.building, m?.facility_descr, m?.facilityDescr, m?.where);
    const score = (days ? 2 : 0) + (start ? 2 : 0) + (end ? 2 : 0) + (location ? 1 : 0);
    if (score > bestScore) {
      best = m;
      bestScore = score;
    }
  }

  const rawDays = normalizeCatalogDayText(firstNonEmpty(
    best?.days, best?.day, best?.meeting_days, best?.meetingDays, best?.mtg_days,
    row?.days, row?.day, row?.meeting_days, row?.meetingDays, row?.mtg_days,
  ));

  const rawStart = firstNonEmpty(
    best?.start_time, best?.startTime, best?.begin_time, best?.beginTime, best?.from_time, best?.fromTime,
    row?.start_time, row?.startTime, row?.begin_time, row?.beginTime,
  );
  const rawEnd = firstNonEmpty(
    best?.end_time, best?.endTime, best?.finish_time, best?.finishTime, best?.to_time, best?.toTime,
    row?.end_time, row?.endTime, row?.finish_time, row?.finishTime,
  );

  const explicitTime = firstNonEmpty(best?.time, best?.meeting_time, best?.meetingTime, row?.time, row?.meeting_time, row?.meetingTime);
  const rawTime = explicitTime
    ? normalizeCatalogTimeText(explicitTime)
    : rawStart && rawEnd
      ? normalizeCatalogTimeText(`${rawStart}-${rawEnd}`)
      : normalizeCatalogTimeText(rawStart || "TBA");

  const location = firstNonEmpty(
    best?.location, best?.room, best?.building, best?.facility_descr, best?.facilityDescr, best?.where,
    row?.location, row?.room, row?.building, row?.facility_descr, row?.facilityDescr,
    "TBA",
  );

  const isOnline = /^(online|async|internet|web|remote|off.?campus)/i.test(location)
    || /^(online|async|internet)/i.test(rawDays)
    || /^(online|async|internet)/i.test(rawTime);

  const startTime = parseApiTime(rawStart) ?? parseCatalogTimeRange(rawTime).startTime;
  const endTime = parseApiTime(rawEnd) ?? parseCatalogTimeRange(rawTime).endTime;
  const days = isOnline ? [] : parseDays(rawDays);

  return { rawDays, rawTime, startTime, endTime, location, isOnline, days };
}

// ── Day parsing ───────────────────────────────────────────────────────────────

const DAY_MAP: Record<string, DayCode> = {
  Mo: "Mon", Tu: "Tue", We: "Wed", Th: "Thu", Fr: "Fri", Sa: "Sat", Su: "Sun",
  // Curriculum API sometimes sends full words
  Mon: "Mon", Tue: "Tue", Wed: "Wed", Thu: "Thu", Fri: "Fri", Sat: "Sat", Sun: "Sun",
  // Single-letter variants
  M: "Mon", T: "Tue", W: "Wed", R: "Thu", F: "Fri", S: "Sat", U: "Sun",
};

function parseDays(raw: string): DayCode[] {
  const out: DayCode[] = [];
  const clean = normalizeCatalogDayText(raw).trim();

  if (!clean || /^(tba|arr)$/i.test(clean)) return out;

  // Try comma/space separated full names first: "Monday, Wednesday"
  if (/Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/i.test(raw)) {
    const parts = String(raw).split(/[\s,\/]+/).filter(Boolean);
    for (const p of parts) {
      const key3 = p.slice(0, 3);
      const key2 = p.slice(0, 2);
      const key1 = p[0];
      const d = DAY_MAP[key3] ?? DAY_MAP[key2] ?? DAY_MAP[key1];
      if (d && !out.includes(d)) out.push(d);
    }
    if (out.length) return out;
  }

  // "TuTh" "MoWe" "MoWeFr" etc.
  const toks = clean.match(/(Mo|Tu|We|Th|Fr|Sa|Su)/gi) ?? [];
  if (toks.length) {
    for (const t of toks) {
      const key = t[0].toUpperCase() + t.slice(1, 2).toLowerCase();
      const d = DAY_MAP[key];
      if (d && !out.includes(d)) out.push(d);
    }
    if (out.length) return out;
  }

  // Single-char "MTWRFS" style
  const singles = clean.toUpperCase().split("");
  for (const ch of singles) {
    const d = DAY_MAP[ch];
    if (d && !out.includes(d)) out.push(d);
  }

  return out;
}

// ── Top-level search ──────────────────────────────────────────────────────────

const SUBJECT_DEPT_MAP: Record<string, string[]> = {
  COMP: ["COMP"],
  CIT: ["COMP"],
  CII: ["COMP"],
};

function normalizeCourseToken(s: string): string {
  return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
function normalizeCourseNumberForSlug(s: string): string {
  return String(s || "").trim().toLowerCase().replace(/[^0-9a-z]+/g, "");
}

function findDepartmentSlug(code: string): string {
  const upper = String(code || "").toUpperCase().trim();
  const found = FALLBACK_DEPTS.find(d => d.code === upper);
  return found?.slug ?? upper.toLowerCase();
}

function buildDirectCourseCandidates(dept: string, search?: string): CourseListing[] {
  const deptUpper = String(dept || "").toUpperCase().trim();
  const direct = parseSpecificCourseQuery(search);
  const numberOnly = !direct && String(search || "").trim().match(/^(\d+[A-Za-z\/-]*)$/);
  const subject = direct?.subject ?? deptUpper;
  const number = direct?.number ?? (numberOnly ? numberOnly[1].toUpperCase() : "");
  if (!number) return [];

  const hostCodes = new Set<string>([deptUpper]);
  for (const mapped of SUBJECT_DEPT_MAP[deptUpper] ?? []) hostCodes.add(mapped);
  for (const mapped of SUBJECT_DEPT_MAP[subject] ?? []) hostCodes.add(mapped);

  const candidates: CourseListing[] = [];
  const seen = new Set<string>();
  const courseSlug = `${subject.toLowerCase()}-${normalizeCourseNumberForSlug(number)}`;
  for (const host of hostCodes) {
    const deptSlug = findDepartmentSlug(host);
    const key = `${host}|${courseSlug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      courseKey: `${subject}-${number}`,
      subject,
      number,
      slug: courseSlug,
      title: `${subject} ${number}`,
      units: 3,
      description: "",
      prerequisites: "",
      url: `${CATALOG}/academics/${deptSlug}/courses/${courseSlug}/`,
    });
  }
  return candidates;
}

function enrichCourseFromPageHtml(course: CourseListing, html: string): CourseListing {
  const flat = html.replace(/\r?\n/g, " ").replace(/\t/g, " ").replace(/\s{2,}/g, " ");
  const m = flat.match(/Course:\s*<[^>]+>\s*([A-Z]{2,6})\s+([0-9A-Z\/-]+)\.\s*([^<]+?)\s*\((\d+(?:[\/-]\d+)?)\)/i);
  const descM = flat.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  if (!m && !descM) return course;

  const descriptionRaw = descM ? stripTags(descM[1]).replace(/\s+/g, " ").trim() : course.description;
  let description = descriptionRaw;
  let prerequisites = course.prerequisites;
  const prereqM = descriptionRaw.match(/^((?:Pre|Co)requisite[^.]*\.)\s*(.*)/i);
  if (prereqM) {
    prerequisites = prereqM[1].replace(/^(?:Pre|Co)requisite[s]?:\s*/i, "").replace(/\.$/, "").trim();
    description = prereqM[2].trim();
  }

  return {
    ...course,
    subject: m?.[1]?.toUpperCase() ?? course.subject,
    number: m?.[2]?.toUpperCase() ?? course.number,
    title: m?.[3]?.trim() || course.title,
    units: m?.[4] ? (parseInt(m[4].split(/[\/-]/)[0], 10) || course.units) : course.units,
    description: description || course.description,
    prerequisites: prerequisites || course.prerequisites,
    courseKey: `${m?.[1]?.toUpperCase() ?? course.subject}-${m?.[2]?.toUpperCase() ?? course.number}`,
  };
}

function parseSpecificCourseQuery(search?: string): { subject: string; number: string } | null {
  const raw = String(search || "").trim();
  if (!raw) return null;
  const m = raw.match(/^([A-Za-z]{2,6})\s*(\d+[A-Za-z\/-]*)$/);
  if (!m) return null;
  return { subject: m[1].toUpperCase(), number: m[2].toUpperCase() };
}

export async function searchSections(params: {
  dept: string;
  search?: string;
  semester: string;
  limit?: number;
}): Promise<SectionSearchResult[]> {
  const { dept, search, semester, limit = 20 } = params;

  const specific = parseSpecificCourseQuery(search);
  const numberOnly = !specific && String(search || "").trim().match(/^(\d+[A-Za-z\/-]*)$/);
  const shouldUseDirect = Boolean(specific || numberOnly);

  let targetCourses: CourseListing[] = [];

  if (shouldUseDirect) {
    targetCourses = buildDirectCourseCandidates(dept, search);
    logger.info({ dept, search, count: targetCourses.length }, "searchSections: using direct course candidates");
  } else {
    const deptCandidates = new Set<string>([dept.toUpperCase().trim()]);
    if (specific?.subject) {
      deptCandidates.add(specific.subject);
      for (const mapped of SUBJECT_DEPT_MAP[specific.subject] ?? []) deptCandidates.add(mapped);
    }

    const mergedCourses: CourseListing[] = [];
    const seenCourse = new Set<string>();
    for (const d of deptCandidates) {
      try {
        const courses = await fetchDeptCourses(d);
        for (const c of courses) {
          if (seenCourse.has(c.courseKey)) continue;
          seenCourse.add(c.courseKey);
          mergedCourses.push(c);
        }
      } catch (err: any) {
        logger.warn({ dept: d, err: err.message }, "searchSections: fetchDeptCourses failed for candidate dept");
      }
    }

    targetCourses = mergedCourses;
    if (search?.trim()) {
      const q = search.trim().toLowerCase();
      const normQ = normalizeCourseToken(q);
      const numMatch = q.match(/^(?:[a-z]{1,6}\s*)?(\d+[a-z\/-]*)$/i);
      targetCourses = mergedCourses.filter(c => {
        const normNum = normalizeCourseToken(c.number);
        const normKey = normalizeCourseToken(c.courseKey);
        if (specific) {
          const normRequested = normalizeCourseToken(`${specific.subject}${specific.number}`);
          return normKey.includes(normRequested) || normRequested.includes(normKey) || normNum.startsWith(normalizeCourseToken(specific.number));
        }
        if (numMatch) return normNum.startsWith(normalizeCourseToken(numMatch[1]));
        return (
          normKey.includes(normQ) ||
          normalizeCourseToken(c.title).includes(normQ) ||
          normNum.includes(normQ) ||
          normalizeCourseToken(c.subject).includes(normQ)
        );
      });
    }
  }

  const batch = targetCourses.slice(0, limit);
  const results: SectionSearchResult[] = [];
  const seenResult = new Set<string>();

  const CONCURRENCY = 4;
  for (let i = 0; i < batch.length; i += CONCURRENCY) {
    const chunk = batch.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      chunk.map(c => fetchCourseSections(c, semester)),
    );
    for (const r of settled) {
      if (r.status !== "fulfilled") continue;
      const course = r.value;
      if (!course.sections.length) continue;
      if (seenResult.has(course.courseKey)) continue;
      seenResult.add(course.courseKey);
      const numVal = parseInt(course.number, 10) || 0;
      results.push({
        courseKey:     course.courseKey,
        subject:       course.subject,
        number:        course.number,
        slug:          course.slug,
        title:         course.title,
        units:         course.units,
        description:   course.description,
        prerequisites: course.prerequisites,
        url:           course.url,
        semester,
        sections:      course.sections,
        tags: [
          course.subject,
          numVal < 200 ? "100s"
            : numVal < 300 ? "200s"
              : numVal < 400 ? "300s"
                : numVal < 500 ? "400s" : "500s+",
          numVal >= 300 ? "Upper Division" : "Lower Division",
        ],
      });
    }
  }

  return results;
}

// ── ICS export ────────────────────────────────────────────────────────────────

const SEM_START: Record<string, string> = {
  "Spring 2026": "20260119", "Summer 2026": "20260601",
  "Fall 2025":   "20250825", "Fall 2026":   "20260824",
};
const SEM_END: Record<string, string> = {
  "Spring 2026": "20260515", "Summer 2026": "20260731",
  "Fall 2025":   "20251219", "Fall 2026":   "20261218",
};
const ICS_DAY: Record<string, string> = {
  Mon: "MO", Tue: "TU", Wed: "WE", Thu: "TH", Fri: "FR", Sat: "SA", Sun: "SU",
};

export function generateICS(cart: CartEntry[], semester: string): string {
  const start = SEM_START[semester] ?? "20260119";
  const end   = SEM_END[semester]   ?? "20260515";

  const lines: string[] = [
    "BEGIN:VCALENDAR", "VERSION:2.0",
    "PRODID:-//CampusConnect//UniCart v5//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${semester} Schedule`,
    "X-WR-TIMEZONE:America/Los_Angeles",
  ];

  for (const e of cart) {
    if (e.isOnline || !e.startTime || !e.endTime || !e.days.length) continue;
    const rrDays = e.days.map(d => ICS_DAY[d]).filter(Boolean).join(",");
    const uid    = `${e.courseKey}-${e.sectionId}@campusconnect`;
    const dtStart = `${start}T${e.startTime.replace(":", "")}00`;
    const dtEnd   = `${start}T${e.endTime.replace(":", "")}00`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `SUMMARY:${e.subject} ${e.number} – ${e.title}`,
      `DTSTART;TZID=America/Los_Angeles:${dtStart}`,
      `DTEND;TZID=America/Los_Angeles:${dtEnd}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${rrDays};UNTIL=${end}T235959Z`,
      `LOCATION:${e.location}`,
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

// ── Static fallback department list ──────────────────────────────────────────

export const FALLBACK_DEPTS: Department[] = [
  { code: "ACCT",  label: "Accountancy",                            slug: "acct"  },
  { code: "AFRS",  label: "Africana Studies",                       slug: "afrs"  },
  { code: "AFAM",  label: "African American Studies",               slug: "african-american-studies" },
  { code: "AIS",   label: "American Indian Studies",                slug: "american-indian-studies" },
  { code: "ANTH",  label: "Anthropology",                           slug: "anth"  },
  { code: "ART",   label: "Art and Design",                         slug: "art"   },
  { code: "BIOL",  label: "Biology",                                slug: "biol"  },
  { code: "BUS",   label: "Business Administration",                slug: "bus"   },
  { code: "CE",    label: "Civil Engineering",                      slug: "civil-engineering-and-construction-management" },
  { code: "CHEM",  label: "Chemistry",                              slug: "chem"  },
  { code: "CJS",   label: "Criminology & Justice Studies",          slug: "cjs"   },
  { code: "CDIS",  label: "Communication Disorders & Sciences",     slug: "communication-disorders-and-sciences" },
  { code: "COMS",  label: "Communication Studies",                  slug: "coms"  },
  { code: "COMP",  label: "Computer Science",                       slug: "comp"  },
  { code: "CTVA",  label: "Cinema & Television Arts",               slug: "ctva"  },
  { code: "DS",    label: "Deaf Studies",                           slug: "deaf-studies" },
  { code: "ECE",   label: "Electrical & Computer Engineering",      slug: "ece"   },
  { code: "ECON",  label: "Economics",                              slug: "econ"  },
  { code: "EDUC",  label: "Education",                              slug: "educ"  },
  { code: "ENGL",  label: "English",                                slug: "engl"  },
  { code: "ENST",  label: "Environmental Science",                  slug: "environmental-science" },
  { code: "FCS",   label: "Family Consumer Sciences",               slug: "fcs"   },
  { code: "GEOG",  label: "Geography & Environmental Studies",      slug: "geog"  },
  { code: "GEOL",  label: "Geological Sciences",                    slug: "geol"  },
  { code: "HS",    label: "Health Sciences",                        slug: "health-sciences" },
  { code: "HIST",  label: "History",                                slug: "hist"  },
  { code: "HSCI",  label: "Health Sciences",                        slug: "hsci"  },
  { code: "KINE",  label: "Kinesiology",                            slug: "kine"  },
  { code: "MATH",  label: "Mathematics",                            slug: "math"  },
  { code: "ME",    label: "Mechanical Engineering",                  slug: "me"    },
  { code: "MKT",   label: "Marketing",                              slug: "mkt"   },
  { code: "MUS",   label: "Music",                                  slug: "mus"   },
  { code: "NURS",  label: "Nursing",                                slug: "nurs"  },
  { code: "PHIL",  label: "Philosophy",                             slug: "phil"  },
  { code: "PHYS",  label: "Physics & Astronomy",                    slug: "phys"  },
  { code: "POLS",  label: "Political Science",                      slug: "pols"  },
  { code: "PSYC",  label: "Psychology",                             slug: "psyc"  },
  { code: "PT",    label: "Physical Therapy",                       slug: "pt"    },
  { code: "SOC",   label: "Sociology",                              slug: "soc"   },
  { code: "SPAN",  label: "Spanish",                                slug: "span"  },
  { code: "SW",    label: "Social Work",                            slug: "sw"    },
];
