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

  const [html, curricMap] = await Promise.all([
    fetchText(url),
    fetchCurriculumMeta(slug, upper),
  ]);

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

// ── STEP 3: Sections via course detail page HTML ─────────────────────────────
//
// CSUN course detail pages contain semester headings followed by static tables.
// Example:
//   Spring-2026 - Schedule of Classes
//   CIT 101
//   Class Number | Location | Day | Time
//   15996 | JD1538 | MoWe | 8:30am-9:20am
//
// Some pages contain multiple related course blocks on the same page, for example
// CIT 101 and CIT 101L under /academics/comp/courses/cit-101l/. We scrape the
// selected semester blocks and keep only the rows whose course label matches the
// requested course number.

export async function fetchCourseSections(
  course: CourseListing,
  semester: string,
): Promise<CourseWithSections> {
  try {
    const html = await fetchText(course.url);
    const sections = parseCourseDetailPage(html, course, semester);
    logger.info({ course: course.courseKey, semester, count: sections.length, url: course.url }, "fetchCourseSections done");
    return { ...course, semester, sections };
  } catch (err: any) {
    logger.warn({ course: course.courseKey, semester, url: course.url, err: err.message }, "fetchCourseSections failed");
    return { ...course, semester, sections: [] };
  }
}

function parseCourseDetailPage(html: string, course: CourseListing, semester: string): ClassSection[] {
  const flat = html.replace(/\r?\n/g, " ").replace(/\t/g, " ").replace(/\s{2,}/g, " ");
  const requestedTerm = semester.replace(/\s+/g, "-").toLowerCase();
  const headingRe = /((Spring|Summer|Fall|Winter)-\d{4})\s*-\s*Schedule\s+of\s+Classes/gi;
  const matches = matchAll(flat, headingRe);
  const sections: ClassSection[] = [];

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const termLabel = String(m[1] ?? "").trim();
    if (termLabel.toLowerCase() !== requestedTerm) continue;

    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? flat.length) : flat.length;
    const block = flat.slice(start, end);

    const blockSections = parseSemesterBlock(block, course);
    for (const s of blockSections) sections.push(s);
  }

  return dedupeSections(sections);
}

function parseSemesterBlock(block: string, course: CourseListing): ClassSection[] {
  const out: ClassSection[] = [];
  const targetNumber = normalizeCourseNumber(course.number);

  // Find repeated: COURSE LABEL + TABLE + rows
  const labelTableRe = /([A-Z]{2,6}\s+[0-9]+[A-Z0-9\/-]*)\s*<table[^>]*>[\s\S]*?<\/table>/gi;
  let m: RegExpExecArray | null;
  while ((m = labelTableRe.exec(block)) !== null) {
    const label = stripTags(m[1]).replace(/\s+/g, " ").trim().toUpperCase();
    const tableHtml = m[0].slice(m[0].indexOf("<table"));

    const labelMatch = label.match(/^([A-Z]{2,6})\s+([0-9]+[A-Z0-9\/-]*)$/i);
    if (!labelMatch) continue;
    const labelNumber = normalizeCourseNumber(labelMatch[2]);
    if (labelNumber !== targetNumber) continue;

    out.push(...parseSectionTable(tableHtml));
  }

  return out;
}

function parseSectionTable(tableHtml: string): ClassSection[] {
  const rows = matchAll(tableHtml, /<tr[^>]*>([\s\S]*?)<\/tr>/gi);
  const sections: ClassSection[] = [];

  for (const row of rows) {
    const cells = matchAll(row[1], /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi).map((c) => stripTags(c[1]).replace(/\s+/g, " ").trim());
    if (cells.length < 4) continue;
    if (/class\s*number/i.test(cells[0])) continue;

    const classNumber = String(cells[0] ?? "").trim();
    const location = String(cells[1] ?? "TBA").trim() || "TBA";
    const rawDays = String(cells[2] ?? "").trim();
    const rawTime = String(cells[3] ?? "").trim();
    if (!/^\d{4,8}$/.test(classNumber)) continue;

    const isOnline = /^(online|async|internet|web|remote|off.?campus)/i.test(location)
      || /^(online|async|internet)/i.test(rawDays)
      || /^(online|async|internet)/i.test(rawTime);

    const timeRange = parseCatalogTimeRange(rawTime);
    sections.push({
      classNumber,
      location,
      days: isOnline ? [] : parseDays(rawDays),
      startTime: timeRange.startTime,
      endTime: timeRange.endTime,
      isOnline,
      rawDays,
      rawTime,
      instructor: "TBA",
      enrolled: 0,
      enrollMax: 0,
      waitlisted: 0,
    });
  }

  return sections;
}

function parseCatalogTimeRange(raw: string): { startTime: string | null; endTime: string | null } {
  const clean = String(raw ?? "").replace(/\s+/g, "").toLowerCase();
  if (!clean || /^(tba|arr|online|async)/i.test(clean)) return { startTime: null, endTime: null };
  const m = clean.match(/(\d{1,2}:\d{2})(am|pm)[\-–](\d{1,2}:\d{2})(am|pm)/i);
  if (!m) return { startTime: null, endTime: null };
  return {
    startTime: to24FromMeridiem(m[1], m[2]),
    endTime: to24FromMeridiem(m[3], m[4]),
  };
}

function to24FromMeridiem(hhmm: string, meridiem: string): string {
  const [rawH, rawM] = hhmm.split(":").map(Number);
  let h = rawH;
  const p = meridiem.toLowerCase();
  if (p === "pm" && h !== 12) h += 12;
  if (p === "am" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${String(rawM).padStart(2, "0")}`;
}

function normalizeCourseNumber(num: string): string {
  return String(num ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
}

function dedupeSections(items: ClassSection[]): ClassSection[] {
  const seen = new Set<string>();
  const out: ClassSection[] = [];
  for (const s of items) {
    const key = `${s.classNumber}|${s.location}|${s.rawDays}|${s.rawTime}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/**
 * Parse CSUN curriculum API time format.
 * Examples: "1000h" → "10:00", "1330h" → "13:30", "900h" → "09:00"
 * Also handles ISO-ish: "10:00", "10:00 AM"
 */
function parseApiTime(raw: string): string | null {
  if (!raw || /^(tba|arr|to be|n\/a|online|async)/i.test(raw.trim())) return null;

  // "1000h" or "1000" (4-digit 24h military)
  const mh = raw.match(/^(\d{3,4})h?$/i);
  if (mh) {
    const n   = mh[1].padStart(4, "0");
    const hh  = n.slice(0, 2);
    const mm  = n.slice(2);
    return `${hh}:${mm}`;
  }

  // "HH:MM" already formatted
  const mcolon = raw.match(/^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/i);
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
  const clean = raw.trim();

  // Try comma/space separated full names first: "Monday, Wednesday"
  if (/Monday|Tuesday|Wednesday|Thursday|Friday/i.test(clean)) {
    const parts = clean.split(/[\s,]+/);
    for (const p of parts) {
      const key = p.slice(0, 3);
      const d   = DAY_MAP[key] ?? DAY_MAP[p.slice(0, 2)] ?? DAY_MAP[p[0]];
      if (d && !out.includes(d)) out.push(d);
    }
    if (out.length) return out;
  }

  // "TuTh" "MoWe" "MoWeFr" "MW" "TR" etc.
  const toks = clean.replace(/\s/g, "").match(/(Mo|Tu|We|Th|Fr|Sa|Su|Mon|Tue|Wed|Thu|Fri|Sat|Sun)/g) ?? [];
  if (toks.length) {
    for (const t of toks) {
      const d = DAY_MAP[t];
      if (d && !out.includes(d)) out.push(d);
    }
    if (out.length) return out;
  }

  // Single-char "MTWRF" style
  const singles = clean.replace(/\s/g, "").split("");
  for (const ch of singles) {
    const d = DAY_MAP[ch.toUpperCase()];
    if (d && !out.includes(d)) out.push(d);
  }

  return out;
}

// ── Top-level search ──────────────────────────────────────────────────────────

export async function searchSections(params: {
  dept: string;
  search?: string;
  semester: string;
  limit?: number;
}): Promise<SectionSearchResult[]> {
  const { dept, search, semester, limit = 20 } = params;

  const query = String(search ?? "").trim();
  const directNumbers = extractCourseNumberCandidates(query);
  let targets: CourseListing[] = [];

  if (directNumbers.length) {
    const direct = await Promise.allSettled(
      directNumbers.map((num) => fetchDirectCourse(dept, num)),
    );
    targets = direct
      .filter((r): r is PromiseFulfilledResult<CourseListing> => r.status === "fulfilled")
      .map((r) => r.value);
  }

  if (!targets.length) {
    const allCourses = await fetchDeptCourses(dept);
    targets = allCourses;
    if (query) {
      const q = query.toLowerCase();
      const numMatch = q.match(/^(?:[a-z]{1,6}\s*)?(\d+[a-z0-9\/]*)$/i);
      targets = allCourses.filter((c) => {
        if (numMatch) return normalizeCourseNumber(c.number).startsWith(normalizeCourseNumber(numMatch[1]));
        return (
          c.courseKey.toLowerCase().replace(/-/, " ").includes(q) ||
          c.title.toLowerCase().includes(q) ||
          c.number.toLowerCase().includes(q) ||
          c.subject.toLowerCase().includes(q)
        );
      });
    }
  }

  const batch = dedupeCourses(targets).slice(0, limit);
  const results: SectionSearchResult[] = [];
  const CONCURRENCY = 4;

  for (let i = 0; i < batch.length; i += CONCURRENCY) {
    const chunk = batch.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(chunk.map((c) => fetchCourseSections(c, semester)));
    for (const r of settled) {
      if (r.status !== "fulfilled") continue;
      const course = r.value;
      const numVal = parseInt(course.number, 10) || 0;
      results.push({
        courseKey: course.courseKey,
        subject: course.subject,
        number: course.number,
        slug: course.slug,
        title: course.title,
        units: course.units,
        description: course.description,
        prerequisites: course.prerequisites,
        url: course.url,
        semester,
        sections: course.sections,
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

async function fetchDirectCourse(dept: string, rawNumber: string): Promise<CourseListing> {
  const deptSlug = dept.toLowerCase().trim();
  const upperDept = dept.toUpperCase().trim();
  const num = String(rawNumber).trim().toUpperCase();
  const aliases = buildDirectCourseCandidates(upperDept, num);
  let html = "";
  let url = "";

  for (const slug of aliases) {
    const candidate = `${CATALOG}/academics/${deptSlug}/courses/${slug}/`;
    try {
      html = await fetchText(candidate);
      url = candidate;
      break;
    } catch {
      continue;
    }
  }

  if (!html || !url) {
    throw new Error(`Course page not found for ${upperDept} ${num}`);
  }

  const parsed = parseCourseHeaderFromDetailPage(html, upperDept, num);
  return {
    courseKey: `${parsed.subject}-${parsed.number}`,
    subject: parsed.subject,
    number: parsed.number,
    slug: url.replace(/.*\/courses\//, "").replace(/\/$/, ""),
    title: parsed.title,
    units: parsed.units,
    description: parsed.description,
    prerequisites: parsed.prerequisites,
    url,
  };
}

function extractCourseNumberCandidates(query: string): string[] {
  if (!query) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const patterns = query.match(/\d+[a-z0-9\/]*/gi) ?? [];
  for (const p of patterns) {
    const v = p.toUpperCase();
    if (!seen.has(v)) { seen.add(v); out.push(v); }
  }
  // Also handle full values like "CIT 101L" where the subject belongs in the slug.
  const full = query.match(/([A-Z]{2,6})\s*(\d+[A-Z0-9\/]*)/i);
  if (full) {
    const v = `${full[1].toUpperCase()} ${full[2].toUpperCase()}`;
    if (!seen.has(v)) { seen.add(v); out.push(v); }
  }
  return out;
}

function buildDirectCourseCandidates(dept: string, rawNumber: string): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const cleaned = rawNumber.toUpperCase().replace(/\s+/g, " ").trim();
  const compact = cleaned.replace(/\s+/g, "").replace(/[^0-9A-Z]/g, "");
  const deptPrefix = `${dept}-`;
  const fullPrefix = cleaned.match(/^([A-Z]{2,6})\s*(\d+[A-Z0-9\/]*)$/);

  const push = (s: string) => {
    const v = s.toLowerCase().replace(/\/+$/g, "");
    if (!seen.has(v)) { seen.add(v); candidates.push(v); }
  };

  if (fullPrefix) {
    push(`${fullPrefix[1]}-${fullPrefix[2].replace(/[^0-9A-Z]/g, "")}`);
  }
  push(`${deptPrefix}${compact}`);
  push(`${deptPrefix}${compact.replace(/([0-9])([A-Z])/g, "$1-$2")}`);
  push(`${dept}-${compact}`);
  push(compact);
  push(compact.replace(/([0-9])([A-Z])/g, "$1-$2"));

  return candidates;
}

function parseCourseHeaderFromDetailPage(html: string, dept: string, fallbackNumber: string): {
  subject: string;
  number: string;
  title: string;
  units: number;
  description: string;
  prerequisites: string;
} {
  const flat = html.replace(/\r?\n/g, " ").replace(/\t/g, " ").replace(/\s{2,}/g, " ");
  const h1 = flat.match(/Course:\s*([A-Z]{2,6})\s+([0-9]+[A-Z0-9\/-]*)\.?(.*?)<\/h1>/i);
  let subject = dept;
  let number = fallbackNumber.toUpperCase().replace(/^([A-Z]{2,6})\s+/, "");
  let title = `${subject} ${number}`;
  let units = 3;

  if (h1) {
    subject = String(h1[1]).toUpperCase();
    number = String(h1[2]).toUpperCase();
    const rest = stripTags(h1[3]).replace(/\s+/g, " ").trim();
    const titleMatch = rest.match(/^(.*?)(?:\((\d+(?:[\/\-]\d+)?)\))?$/);
    if (titleMatch) {
      title = (titleMatch[1] || title).trim();
      units = parseInt(String(titleMatch[2] || "3").split(/[\/\-]/)[0], 10) || 3;
    }
  }

  const descP = flat.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  const descRaw = descP ? stripTags(descP[1]).replace(/\s+/g, " ").trim() : "";
  let description = descRaw;
  let prerequisites = "";
  const prereqM = descRaw.match(/^((?:Pre|Co)requisite[^.]*\.)\s*(.*)/i);
  if (prereqM) {
    prerequisites = prereqM[1].replace(/^(?:Pre|Co)requisite[s]?:\s*/i, "").replace(/\.$/, "").trim();
    description = prereqM[2].trim();
  }

  return { subject, number, title, units, description, prerequisites };
}

function dedupeCourses(items: CourseListing[]): CourseListing[] {
  const seen = new Set<string>();
  const out: CourseListing[] = [];
  for (const c of items) {
    if (seen.has(c.courseKey)) continue;
    seen.add(c.courseKey);
    out.push(c);
  }
  return out;
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
