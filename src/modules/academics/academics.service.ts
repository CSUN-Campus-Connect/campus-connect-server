import type {
  CourseKey,
  ElectiveGroup,
  MajorHit,
  MajorLevel,
  ParsedRoadmap,
  PlannerBuildResponse,
  PrereqExpr,
  RequirementGraphEdge,
  RequirementGraphNode,
  RoadmapLink,
  SuggestRoadmapsResponse
} from "./academics.types";

/* ================================
   Sources and constants for tree build with CSUN curriculum data
================================ */
const CSUN_CURRICULUM_V2 = "https://www.csun.edu/web-dev/api/curriculum/2.0";
const CATALOG_ORIGIN = "https://catalog.csun.edu";
const ROADMAPS_BY_MAJOR = "https://catalog.csun.edu/road-maps-by-major/";

/* ================================
   Tiny concurrency limiter + TTL cache
================================ */
function createLimiter(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    if (active >= concurrency) return;
    const job = queue.shift();
    if (!job) return;
    job();
  };

  return function limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        active++;
        fn()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      };
      queue.push(run);
      next();
    });
  };
}

type CacheEntry<T> = { expiresAt: number; value: T };
class TTLCache<T> {
  private map = new Map<string, CacheEntry<T>>();
  constructor(private ttlMs: number, private max = 600) {}

  get(key: string): T | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (Date.now() > hit.expiresAt) {
      this.map.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: T) {
    if (this.map.size >= this.max) {
      const firstKey = this.map.keys().next().value;
      if (firstKey) this.map.delete(firstKey);
    }
    this.map.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }
}

const htmlCache = new TTLCache<string>(60 * 60 * 1000, 150);
const jsonCache = new TTLCache<any>(10 * 60 * 1000, 900);

/* ================================
   Fetch helpers (Node 22 has global fetch)
================================ */
async function fetchText(url: string, timeoutMs = 12_000): Promise<string> {
  const cached = htmlCache.get(url);
  if (cached) return cached;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      headers: { accept: "text/html,application/xhtml+xml,*/*" },
      signal: controller.signal
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
    }

    const text = await res.text();
    htmlCache.set(url, text);
    return text;
  } finally {
    clearTimeout(t);
  }
}

async function fetchJson<T>(url: string, timeoutMs = 12_000): Promise<T> {
  const cached = jsonCache.get(url);
  if (cached) return cached as T;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
    }

    const data = (await res.json()) as T;
    jsonCache.set(url, data);
    return data;
  } finally {
    clearTimeout(t);
  }
}

/* ================================
   Major search (CSUN curriculum API)
================================ */
type PlansResponse = {
  plans: Array<{
    plan_code: string;
    plan_description: string;
    plan_type?: string;
    plan_category?: string;
  }>;
};

export async function searchMajors(query: string, level: MajorLevel): Promise<MajorHit[]> {
  const url = `${CSUN_CURRICULUM_V2}/plans/${level}`;
  const data = await fetchJson<PlansResponse>(url);

  const q = String(query ?? "").trim().toLowerCase();

  const items: MajorHit[] = (data.plans ?? []).map(p => {
    const id = String(p?.plan_code ?? "").trim();
    const name = String(p?.plan_description ?? "").trim(); // can be empty
    return {
      id,
      name,
      type: p?.plan_type != null ? String(p.plan_type) : null,
      category: p?.plan_category != null ? String(p.plan_category) : null
    };
  });

  const filtered = q
    ? items.filter(it => {
        const name = String(it.name ?? "");
        const id = String(it.id ?? "");
        return name.toLowerCase().includes(q) || id.toLowerCase().includes(q);
      })
    : items;

  // Deduplicate by ID + name, but ignore empty strings
  const seenId = new Set<string>();
  const seenName = new Set<string>();
  const out: MajorHit[] = [];

  for (const m of filtered) {
    const idKey = String(m.id ?? "").trim().toLowerCase();
    const nameKey = String(m.name ?? "").trim().toLowerCase();

    if (idKey && seenId.has(idKey)) continue;
    if (nameKey && seenName.has(nameKey)) continue;

    if (idKey) seenId.add(idKey);
    if (nameKey) seenName.add(nameKey);

    // Don’t return null (empty-name) results unless the query matches the id
    if (!m.name && q && !(m.id || "").toLowerCase().includes(q)) continue;

    out.push(m);
  }

  // Prefer valid entries names over null/empty names, but keep the original order otherwise
  out.sort((a, b) => (b.name ? 1 : 0) - (a.name ? 1 : 0));

  return out.slice(0, 60);
}


/* ================================
   Catalog years
================================ */
export function listCatalogYears(): string[] {
  const now = new Date().getFullYear();
  const out: string[] = [];
  for (let y = now + 1; y >= now - 10; y--) out.push(String(y));
  return out;
}

/* ================================
   Roadmaps: list departments, list roadmaps, parse roadmap
================================ */
function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").trim();
}

function absoluteCatalogUrl(href: string): string {
  try {
    return new URL(href, CATALOG_ORIGIN).toString();
  } catch {
    return href;
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h1|h2|h3|h4|h5|h6)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .trim();
}

export async function listRoadmapDepartments(): Promise<RoadmapLink[]> {
  const urlsToTry = [
    ROADMAPS_BY_MAJOR, // https://catalog.csun.edu/road-maps-by-major/
    `${CATALOG_ORIGIN}/degree-road-maps/`
  ];

  const out: RoadmapLink[] = [];

  for (const url of urlsToTry) {
    let html = "";
    try {
      html = await fetchText(url);
    } catch {
      continue;
    }

    // Robustly extract dept-road-maps links from the page, even if the structure is weird or changes over time.
    const slugRe = /\/dept-road-maps\/([a-z0-9-]+)\/?/gi;
    const slugs = new Set<string>();
    for (const m of html.matchAll(slugRe)) {
      if (m[1]) slugs.add(m[1]);
    }

    // Try to also capture labels from nearby anchor tags
    const anchorRe = /<a[^>]+href="([^"]*\/dept-road-maps\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    for (const m of html.matchAll(anchorRe)) {
      const href = (m[1] ?? "").trim();
      const title = stripTags(m[2] ?? "").replace(/\s+/g, " ").trim();
      if (!href.includes("/dept-road-maps/")) continue;
      out.push({ title: title || href, url: absoluteCatalogUrl(href) });
    }

    // If anchors fail, fall back to slug-based links with best-effort titles (slug → title case)
    if (out.length === 0 && slugs.size > 0) {
      for (const s of slugs) {
        out.push({
          title: s,
          url: `${CATALOG_ORIGIN}/dept-road-maps/${s}/`
        });
      }
    }

    if (out.length > 0) break;
  }

  // Deduplicate
  const seen = new Set<string>();
  return out
    .map(x => ({ title: x.title || x.url, url: x.url }))
    .filter(x => {
      if (seen.has(x.url)) return false;
      seen.add(x.url);
      return true;
    });
}

export async function listRoadmapsForDepartment(slug: string): Promise<RoadmapLink[]> {
  const urlsToTry = [
    `${CATALOG_ORIGIN}/dept-road-maps/${encodeURIComponent(slug)}/`,
    `${CATALOG_ORIGIN}/resource/road-map/${encodeURIComponent(slug)}/`, // program listing fallback (important!****)
    `${CATALOG_ORIGIN}/resource/road-map-prgms/${encodeURIComponent(slug)}/` // another common listing
  ];

  const out: RoadmapLink[] = [];

  for (const url of urlsToTry) {
    let html = "";
    try {
      html = await fetchText(url);
    } catch {
      continue;
    }

    const linkRe = /<a[^>]+href="([^"]+\/resource\/road-map\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

    for (const m of html.matchAll(linkRe)) {
      const href = (m[1] ?? "").trim();
      const title = stripTags(m[2] ?? "").replace(/\s+/g, " ").trim();
      if (!href.includes("/resource/road-map/")) continue;
      if (!title) continue;
      out.push({ title, url: absoluteCatalogUrl(href) });
    }

    // Even more robust: if anchors fail, scrape hrefs directly
    if (out.length === 0) {
      const hrefRe = /\/resource\/road-map\/(\d{4})\/[a-z0-9-]+\/?/gi;
      const hrefs = new Set<string>();
      for (const m of html.matchAll(hrefRe)) {
        hrefs.add(`/resource/road-map/${m[1]}/${m[0].split(`/resource/road-map/${m[1]}/`)[1]}`.replace(/\/?$/,"/"));
      }
      for (const h of hrefs) {
        out.push({ title: h, url: absoluteCatalogUrl(h) });
      }
    }

    if (out.length > 0) break;
  }

  const seen = new Set<string>();
  return out.filter(x => {
    if (!x.url) return false;
    if (seen.has(x.url)) return false;
    seen.add(x.url);
    return true;
  });
}


function parseCourseToken(rawText: string) {
  const raw = rawText.replace(/\s+/g, " ").trim();
  const m = raw.match(/\b([A-Z]{2,6})\s+([0-9]{2,4}[A-Z]{0,3})(?:\/[A-Z])?\b/);
  if (!m) return { raw };

  const subject = m[1].toUpperCase();
  const catalog = m[2].toUpperCase();
  const courseKey = `${subject}-${catalog}`;
  return { raw, subject, catalog, courseKey };
}

export async function parseRoadmap(url: string): Promise<ParsedRoadmap> {
  const html = await fetchText(url);

  const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = stripTags(titleMatch?.[1] ?? "") || "Roadmap";

  const text = htmlToText(html);
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  const semesters: ParsedRoadmap["semesters"] = [];

  // Dynamically parse semester headings and their courses. Works across a variety of formats, including:
  //   "YEAR 1:"          – classic format
  //   "Semester 1"       – some newer pages
  //   "Fall 2024"        – year-specific pages
  //   "Fall Semester"    – RTM and other depts
  //   "Spring Semester"  – same
  //   "Summer"           – occasionally
  const semesterHeadingRe =
    /^(?:YEAR\s+\d+\s*:|(?:(?:fall|spring|summer|winter)\s*(?:semester|quarter)?(?:\s+\d{4})?|semester\s+\d+))\s*$/i;

  const courseRe = /\b([A-Z]{2,6})\s+([0-9]{2,4}[A-Z]{0,3})(?:\/[A-Z])?\b/g;

  let currentLabel: string | null = null;
  let currentCourses: string[] = [];

  const pushSemester = () => {
    if (!currentLabel) return;
    const unique = Array.from(new Set(currentCourses));
    semesters.push({
      label: currentLabel,
      courses: unique.map(parseCourseToken)
    });
  };

  for (const line of lines) {
    if (semesterHeadingRe.test(line)) {
      pushSemester();
      currentLabel = line;
      currentCourses = [];
      continue;
    }
    if (!currentLabel) continue;

    const matches = Array.from(line.matchAll(courseRe)).map(m => `${m[1]} ${m[2]}`);
    for (const c of matches) currentCourses.push(c);
  }

  pushSemester();

  // ── Fallback: if the heading-based approach found nothing, do a
  //    table-cell or flat scrape >  returning an empty roadmap.
  if (semesters.length === 0) {
    const allCourses = Array.from(
      new Set(
        Array.from(text.matchAll(/\b([A-Z]{2,6})\s+([0-9]{2,4}[A-Z]{0,3})\b/g)).map(
          m => `${m[1]} ${m[2]}`
        )
      )
    );
    if (allCourses.length > 0) {
      semesters.push({
        label: "All Courses",
        courses: allCourses.map(parseCourseToken)
      });
    }
  }

  return { title, semesters };
}

/* ================================
   Catalog elective scraping
   Fetches the CSUN catalog program page and extracts named elective
   groups (e.g. "15 units minimum to be selected from the following").
================================ */

/** Attempt to derive a catalog program URL from the major name.
 *  Falls back to a best-effort slug approach when we can't find it
 *  from the roadmap. */
function guessCatalogUrl(majorName: string): string {
  const slug = majorName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
  return `${CATALOG_ORIGIN}/academics/${slug}/`;
}

/** Parse units from strings like "15 units", "up to 4 units", "up to 3 elective units" */
function parseUnitConstraint(text: string): { min?: number; max?: number } {
  const up = text.match(/up\s+to\s+(\d+)/i);
  if (up) return { max: Number(up[1]) };
  const min = text.match(/(\d+)\s+units?\s+minimum/i);
  if (min) return { min: Number(min[1]) };
  const plain = text.match(/^(\d+)\s+units?/i);
  if (plain) return { min: Number(plain[1]), max: Number(plain[1]) };
  return {};
}

/* ================================
   Catalog upper-division elective scraping

   Fetches the CSUN catalog program page and extracts:
   1. Named elective groups ("15 units minimum to be selected from the following")
   2. Upper-division elective rules — dynamically parsed from catalog text:
      • Required units, level filter (400/500), primary subject
      • Allowed cross-department courses (e.g. "may include MATH 481A")
      • Fetches ALL matching courses from the CSUN curriculum API
================================ */

/**
 * Parses an upper-division elective rule from catalog free text.
 * Handles patterns like:
 *   "15 units of 400- or 500-level courses in Computer Science
 *    (not COMP 482, 490/L, 491/L, 492, 494, 499, or 502).
 *    The electives may include MATH 481A (Numerical Analysis) as 3 of the 15 units."
 *
 *   "Select 9 units from 300- or 400-level courses in the major"
 *   "12 units of upper division courses in the major"
 */
function parseUpperDivElectiveRule(paragraphs: string[]): {
  requiredUnits: number;
  minLevel: number;   // e.g. 400
  maxLevel: number;   // e.g. 599 (to include all 500-level courses)
  primarySubject: string | null;
  excludedKeys: Set<string>;
  allowedExtras: Array<{ courseKey: string; maxUnits: number }>;
} | null {

  const courseCodeRe = /([A-Z]{2,6})\s+([0-9]{2,4}[A-Z]{0,3}(?:\/[LDA])?)/g;

  for (const para of paragraphs) {
    // Include unit and requirement keywords to avoid false positives from other rules or course mentions
    const unitsMatch = para.match(/(\d+)\s+units?\s+of\s+(?:senior\s+electives?|upper\s+division|[\w\s-]+level)/i)
      || para.match(/(\d+)\s+units?\s+(?:minimum|required)/i);
    if (!unitsMatch) continue;

    const requiredUnits = parseInt(unitsMatch[1], 10);
    if (requiredUnits < 3 || requiredUnits > 40) continue;

    // Extract level bands: "400- or 500-level", "300- or 400-level", "upper division" → 300+
    const levelMatch = para.match(/(\d00)-\s*(?:or\s+(\d00)-\s*)?level/i)
      || para.match(/upper\s+division/i);
    let minLevel = 300;
    let maxLevel = 599;
    if (levelMatch && levelMatch[1]) {
      minLevel = parseInt(levelMatch[1], 10);
      maxLevel = levelMatch[2] ? parseInt(levelMatch[2], 10) + 99 : minLevel + 99;
    }

    // Extract primary subject: "courses in Computer Science" → look up dept abbrev via subject map
    // Also accept "courses in the major" (subject determined from context)
    const subjMatch = para.match(/courses?\s+in\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
    const primarySubjectName = subjMatch?.[1] ?? null;

    // Extract excluded course keys from parenthetical "(not COMP 482, 490/L, 491/L, 492, ...)"
    const excludedKeys = new Set<string>();
    const notMatch = para.match(/\(not\s+([^)]+)\)/i);
    if (notMatch) {
      const notText = notMatch[1];
      // Find the subject prefix — first word like "COMP", "ACCT", etc.
      const subjPrefixMatch = notText.match(/^([A-Z]{2,6})\s/);
      const subjPrefix = subjPrefixMatch?.[1] ?? "";
      // Extract all numbers (with optional /L /A suffixes)
      const numRe = /([0-9]{2,4}(?:\/[LDA])?)/g;
      let nm: RegExpExecArray | null;
      while ((nm = numRe.exec(notText)) !== null) {
        const raw = nm[1];
        if (raw.includes("/")) {
          // "490/L" → COMP-490 and COMP-490L
          const base = raw.split("/")[0];
          const suffix = raw.split("/")[1];
          excludedKeys.add(`${subjPrefix}-${base}`);
          excludedKeys.add(`${subjPrefix}-${base}${suffix}`);
        } else {
          excludedKeys.add(`${subjPrefix}-${raw}`);
        }
      }
    }

    // Extract "may include SUBJ NNN (Title) as X units"
    const allowedExtras: Array<{ courseKey: string; maxUnits: number }> = [];
    const includeRe = /may\s+include\s+([A-Z]{2,6})\s+([0-9]{2,4}[A-Z]*)\s*(?:\([^)]+\))?\s+as\s+(\d+)\s+of/gi;
    let im: RegExpExecArray | null;
    while ((im = includeRe.exec(para)) !== null) {
      allowedExtras.push({
        courseKey: `${im[1]}-${im[2]}`,
        maxUnits: parseInt(im[3], 10),
      });
    }

    return { requiredUnits, minLevel, maxLevel, primarySubject: primarySubjectName, excludedKeys, allowedExtras };
  }
  return null;
}

/*CSUN Name to Subject Abbreviation Mapping */
const DEPT_NAME_TO_SUBJECT: Record<string, string> = {
  "computer science": "COMP",
  "mathematics": "MATH",
  "electrical engineering": "ECE",
  "electrical and computer engineering": "ECE",
  "civil engineering": "CE",
  "mechanical engineering": "ME",
  "chemistry": "CHEM",
  "biology": "BIOL",
  "physics": "PHYS",
  "accounting": "ACCT",
  "finance": "FIN",
  "management": "MGT",
  "marketing": "MKT",
  "information systems": "IS",
  "nursing": "NURS",
  "psychology": "PSY",
  "sociology": "SOC",
  "history": "HIST",
  "english": "ENGL",
  "art": "ART",
  "music": "MUS",
  "kinesiology": "KIN",
  "communication studies": "COMS",
  "communication disorders": "CODS",
  "journalism": "JRN",
  "political science": "POLS",
  "economics": "ECON",
  "environmental science": "ESC",
  "geology": "GEOL",
  "geography": "GEOG",
  "recreation tourism management": "RTM",
  "recreation": "RTM",
  "social work": "SWK",
  "criminal justice": "CJS",
  "educational psychology": "EDUC",
  "chicana": "CHS",
  "anthropology": "ANTH",
  "philosophy": "PHIL",
  "health sciences": "HSCI",
  "public health": "HSCI",
};

/* Fetch all courses for a subject from CSUN curriculum API */
async function fetchSubjectCourses(subject: string): Promise<Array<{
  courseKey: string; title: string; units: number;
}>> {
  const url = `${CSUN_CURRICULUM_V2}/courses/${subject.toLowerCase()}`;
  try {
    const data = await fetchJson<any>(url);
    return (data.courses ?? []).map((c: any) => ({
      courseKey: `${subject.toUpperCase()}-${String(c.catalog_number ?? c.catalog ?? "").toUpperCase().trim()}`,
      title: String(c.title ?? ""),
      units: c.units != null ? Number(c.units) : 3,
    })).filter((c: any) => c.courseKey.includes("-") && c.courseKey.split("-")[1]);
  } catch {
    return [];
  }
}

export async function fetchCatalogElectives(
  catalogUrl: string
): Promise<ElectiveGroup[]> {
  let html: string;
  try {
    html = await fetchText(catalogUrl);
  } catch {
    return [];
  }

  const text = htmlToText(html);
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  const groups: ElectiveGroup[] = [];

  // ── PART 1: Named elective groups (existing logic) ─────────────────────────
  // Matches: "15 units minimum to be selected from the following:"
  //          "Up to 4 elective units may be selected from..."
  const groupHeaderRe =
    /(?:(\d+)\s+units?\s+minimum\s+to\s+be\s+selected|up\s+to\s+(\d+)\s+(?:elective\s+)?units?\s+may\s+be\s+selected(?:\s+from)?)/i;

  const courseLineRe = /([A-Z]{2,6})\s+([0-9]{2,4}[A-Z]{0,3}(?:\/[A-Z])?)/g;
  const unitsRe = /\((\d+)(?:\/(\d+))?\)/;

  let inGroup = false;
  let currentGroupLabel = "";
  let currentConstraints: { min?: number; max?: number } = {};
  let currentOptions: Array<{ courseKey: string; raw: string; units?: number }> = [];
  let groupId = 0;

  const pushGroup = () => {
    if (!inGroup || currentOptions.length === 0) return;
    groups.push({
      id: `cat-eg-${groupId++}`,
      label: currentGroupLabel,
      source: "catalog",
      semesterHint: "",
      minUnits: currentConstraints.min,
      maxUnits: currentConstraints.max,
      options: currentOptions,
      chosen: null,
    });
  };

  for (const line of lines) {
    const headerMatch = line.match(groupHeaderRe);
    if (headerMatch) {
      pushGroup();
      inGroup = true;
      currentGroupLabel = line;
      currentConstraints = parseUnitConstraint(line);
      currentOptions = [];
      continue;
    }

    if (inGroup) {
      const hasCourse = courseLineRe.test(line);
      courseLineRe.lastIndex = 0;
      if (!hasCourse && /^[A-Z][^a-z]{4,}/.test(line) && line.length < 60) {
        pushGroup();
        inGroup = false;
        currentOptions = [];
        continue;
      }

      let m: RegExpExecArray | null;
      courseLineRe.lastIndex = 0;
      const foundOnLine: typeof currentOptions = [];
      while ((m = courseLineRe.exec(line)) !== null) {
        const subj = m[1];
        const cat = m[2].replace("/", "");
        const courseKey = `${subj}-${cat}`;
        const unitsMatch = line.match(unitsRe);
        let units: number | undefined;
        if (unitsMatch) {
          units = Number(unitsMatch[1]) + (unitsMatch[2] ? Number(unitsMatch[2]) : 0);
        }
        foundOnLine.push({ courseKey, raw: line.replace(/\s+/g, " ").trim(), units });
      }

      for (const entry of foundOnLine) {
        if (!currentOptions.some(o => o.courseKey === entry.courseKey)) {
          currentOptions.push(entry);
        }
      }
    }
  }
  pushGroup();

  // ── PART 2: Upper-division elective rule (dynamic) ─────────────────────────
  // Find the "Upper Division Electives" section in the page.
  // Grab the paragraph(s) that describe the rule, then:
  //   a) Parse the rule (units, level, exclusions, extras)
  //   b) Determine primary subject from page context or dept name
  //   c) Fetch ALL courses for that subject from the CSUN API
  //   d) Filter to correct level bands, remove excluded courses
  //   e) Add allowed cross-dept extras 

  // Find "Upper Division Electives" heading
  const upperDivIdx = lines.findIndex(l =>
    /upper\s+division\s+electives?/i.test(l)
  );

  if (upperDivIdx >= 0) {
    // Collect the next 10 lines as the elective rule context
    const contextLines = lines.slice(upperDivIdx + 1, upperDivIdx + 12);
    const contextParagraph = contextLines.join(" ");

    const rule = parseUpperDivElectiveRule([contextParagraph, ...contextLines]);

    if (rule) {
      // Determine the primary subject abbreviation
      // 1. Try to match subject name from catalog text → abbrev map
      // 2. Try to extract from the URL path: /academics/comp/... → "COMP"
      // 3. Fall back to scanning the course codes already on the page

      let primarySubject: string | null = null;

      if (rule.primarySubject) {
        const normalized = rule.primarySubject.toLowerCase().trim();
        primarySubject = DEPT_NAME_TO_SUBJECT[normalized] ?? null;
      }

      if (!primarySubject) {
        const urlMatch = catalogUrl.match(/\/academics\/([a-z]{2,6})\//i);
        if (urlMatch) primarySubject = urlMatch[1].toUpperCase();
      }

      if (!primarySubject) {
        // Scan page for the most frequent subject code in upper-div range
        const allCodes: string[] = [];
        const scanRe = /\b([A-Z]{2,6})\s+([4-5]\d{2})/g;
        for (const l of lines) {
          let sm: RegExpExecArray | null;
          while ((sm = scanRe.exec(l)) !== null) allCodes.push(sm[1]);
        }
        const freq = new Map<string, number>();
        for (const c of allCodes) freq.set(c, (freq.get(c) ?? 0) + 1);
        if (freq.size > 0) {
          primarySubject = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
        }
      }

      if (primarySubject) {
        // Fetch all courses for this subject from CSUN API
        const allCourses = await fetchSubjectCourses(primarySubject);

        // Filter: correct level band, not excluded
        const eligible = allCourses.filter(c => {
          const catNum = parseInt(c.courseKey.split("-")[1]?.replace(/[A-Z]+$/i, "") ?? "0", 10);
          if (catNum < rule.minLevel || catNum > rule.maxLevel + 99) return false;
          if (rule.excludedKeys.has(c.courseKey)) return false;
          return true;
        });

        // Add allowed cross-dept extras
        const extraOptions: typeof eligible = [];
        for (const extra of rule.allowedExtras) {
          const parts = extra.courseKey.split("-");
          if (parts.length >= 2) {
            const extraCourses = await fetchSubjectCourses(parts[0]);
            const match = extraCourses.find(c => c.courseKey === extra.courseKey);
            if (match) extraOptions.push({ ...match, units: extra.maxUnits });
          }
        }

        const options: ElectiveGroup["options"] = [
          ...eligible.map(c => ({ courseKey: c.courseKey, raw: `${c.courseKey} ${c.title}`, units: c.units })),
          ...extraOptions.map(c => ({ courseKey: c.courseKey, raw: `${c.courseKey} ${c.title} (up to ${c.units}u)`, units: c.units })),
        ];

        if (options.length > 0) {
          // Build uyser friendly label with all the parsed info
          const excludedList = rule.excludedKeys.size > 0
            ? ` (excluding ${[...rule.excludedKeys].join(", ")})`
            : "";
          const extraList = rule.allowedExtras.length > 0
            ? `; may include ${rule.allowedExtras.map(e => e.courseKey).join(", ")}`
            : "";

          groups.push({
            id: `cat-eg-upper-div-${groupId++}`,
            label: `Upper Division Electives — ${rule.requiredUnits} units of ${rule.minLevel}–${rule.maxLevel + 99}-level ${primarySubject} courses${excludedList}${extraList}`,
            source: "catalog",
            semesterHint: "",
            minUnits: rule.requiredUnits,
            maxUnits: rule.requiredUnits,
            options,
            chosen: null,
          });
        }
      }
    }
  }

  return groups;
}


/* ================================
   Prereq parsing + requirements graph
================================ */
function normalizeCourseKeyLoose(subject: string, catalog: string): CourseKey {
  return `${subject.trim().toUpperCase()}-${catalog.trim().toUpperCase()}`;
}

function parsePrereqFromDescription(description: string | null | undefined): PrereqExpr | undefined {
  if (!description) return undefined;

  const lower = description.toLowerCase();
  const idx = lower.indexOf("prerequisite");
  if (idx === -1) return undefined;

  const slice = description.slice(idx);

  // Extract the prereq clause — handles multiple CSUN description formats:
  //   "Prerequisites: ..." (most common)
  //   "Prerequisite or Corequisite: ..."  (treat as prereq)
  //   Descriptions that are truncated (no period at end — match to end of string)
  const m = slice.match(
    /prerequisites?(?:\s+or\s+corequisites?)?\s*:\s*([^]*?)(?=\n|\. |\.$|$)/i
  );
  const rawClause = (m?.[1] ?? "").trim();

  // Fallback: grab everything after the colon up to 300 chars
  const clause = rawClause || slice.replace(/prerequisites?[^:]*:\s*/i, "").slice(0, 300).trim();
  if (!clause) return { kind: "unknown", text: slice.slice(0, 220) };

  // Normalize: remove common leading phrases that aren't relevant to the core prereq structure
  const normalized = clause
    .replace(/\b(completion\s+of|concurrent\s+enrollment\s+in|credit\s+in|passing\s+grade\s+in|grade\s+of\s+[A-Z]\s+or\s+better\s+in)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  const re = /\b([A-Z]{2,6})\s*([0-9]{2,4}[A-Z]{0,3})\b/g;
  if (!normalized.match(re)) return { kind: "unknown", text: clause };

  // Split on semicolons (AND groups), then "or" within each group
  const parts = normalized.split(/[;]/g).map(s => s.trim()).filter(Boolean);
  const andItems: PrereqExpr[] = [];

  for (const part of parts.length ? parts : [normalized]) {
    const orParts = part.split(/\s+or\s+/i).map(s => s.trim()).filter(Boolean);
    const orItems: PrereqExpr[] = [];

    for (const op of orParts) {
      // Also split comma-separated lists within an OR group as AND
      const commaParts = op.split(/,/).map(s => s.trim()).filter(Boolean);
      const local: PrereqExpr[] = [];
      for (const cp of commaParts) {
        re.lastIndex = 0;
        for (const match of cp.matchAll(re)) {
          local.push({ kind: "course", course: normalizeCourseKeyLoose(match[1], match[2]) });
        }
      }
      if (local.length === 1) orItems.push(local[0]);
      else if (local.length > 1) orItems.push({ kind: "and", items: local });
    }

    if (orItems.length === 1) andItems.push(orItems[0]);
    else if (orItems.length > 1) andItems.push({ kind: "or", items: orItems });
  }

  if (andItems.length === 1) return andItems[0];
  if (andItems.length > 1) return { kind: "and", items: andItems };
  return { kind: "unknown", text: clause };
}

export async function buildRequirementsGraph(courses: string[]): Promise<{ nodes: RequirementGraphNode[]; edges: RequirementGraphEdge[] }> {
  const normalizedKeys = Array.from(
    new Set(
      courses
        .map(c => c.trim())
        .filter(Boolean)
        .map(c => c.toUpperCase().replace(/\s+/g, "-"))
    )
  );

  const limit = createLimiter(6);

  const nodes: RequirementGraphNode[] = await Promise.all(
    normalizedKeys.map(key =>
      limit(async () => {
        const fetchKey = key.toLowerCase();
        const url = `${CSUN_CURRICULUM_V2}/courses/${encodeURIComponent(fetchKey)}`;
        const data = await fetchJson<any>(url);

        const course = data.courses?.[0];
        const title = course?.title ?? null;
        const units = course?.units != null ? Number(course.units) : null;
        const prereq = parsePrereqFromDescription(course?.description);

        return { key, title, units, prereq };
      })
    )
  );

  const nodeSet = new Set(nodes.map(n => n.key));
  const edges: RequirementGraphEdge[] = [];

  function extractCourses(expr: PrereqExpr | undefined): CourseKey[] {
    if (!expr) return [];
    if (expr.kind === "unknown") return [];
    if (expr.kind === "course") return [expr.course];
    if (expr.kind === "and" || expr.kind === "or") return expr.items.flatMap(extractCourses);
    return [];
  }

  for (const n of nodes) {
    for (const p of extractCourses(n.prereq)) {
      if (nodeSet.has(p)) edges.push({ from: p, to: n.key });
    }
  }

  return { nodes, edges };
}

/* ================================
   Suggest roadmaps + build planner
================================ */
function normalizeText(s: string) {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s: string): string[] {
  const stop = new Set(["and", "of", "the", "in", "for", "to", "with", "option", "concentration", "track"]);
  return normalizeText(s)
    .split(" ")
    .filter(t => t.length >= 3 && !stop.has(t));
}

function scoreTitleMatch(majorName: string, title: string, year: string) {
  const major = normalizeText(majorName);
  const t = normalizeText(title);

  const majorTokens = new Set(tokenize(majorName));
  const titleTokens = tokenize(title);

  let tokenHits = 0;
  for (const tok of titleTokens) if (majorTokens.has(tok)) tokenHits++;

  // Strong boosts for substring containment either direction
  const containsMajor = t.includes(major) ? 1 : 0;
  const containsTitleInMajor = major.includes(t) ? 1 : 0;

  // Year is often missing from titles, so keep this small
  const yearHit = year && title.includes(year) ? 1 : 0;

  // common formatting boosts
  const bsBoost = /b\.?s\.?/i.test(title) ? 4 : 0;
  const baBoost = /b\.?a\.?/i.test(title) ? 3 : 0;

  return (
    tokenHits * 12 +
    containsMajor * 80 +
    containsTitleInMajor * 10 +
    yearHit * 10 +
    bsBoost +
    baBoost -
    Math.max(0, titleTokens.length - 16)
  );
}

function extractDeptSlug(url: string): string | null {
  const m = url.match(/\/dept-road-maps\/([^/]+)\/?$/i);
  return m?.[1] ?? null;
}

export async function suggestRoadmaps(majorName: string, year: string, limit = 5): Promise<SuggestRoadmapsResponse> {
  const departments = await listRoadmapDepartments();

  // If departments list is empty, we cannot proceed with the old method.
  // Return empty results and let buildPlanner handle fallback.
  if (!departments.length) {
    return { majorName, year, results: [] };
  }

  const scored: Array<RoadmapLink & { score: number }> = [];

  for (const dept of departments) {
    const slug = extractDeptSlug(dept.url);
    if (!slug) continue;

    const roadmaps = await listRoadmapsForDepartment(slug);
    for (const rm of roadmaps) {
      const score = scoreTitleMatch(majorName, rm.title ?? "", year);
      scored.push({ ...rm, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  // Keep weak matches too, but prioritize good ones
  const good = scored.filter(s => s.score >= 10);
  return {
    majorName,
    year,
    results: (good.length ? good : scored).slice(0, limit)
  };
}

export async function buildPlanner(majorName: string, year: string, limit = 5): Promise<PlannerBuildResponse> {
  // 1) Try the global suggestion approach
  let suggestion = await suggestRoadmaps(majorName, year, limit);

  // 2) If that failed completely, do a direct department-slug fallback:
  // Find best department slug by matching department titles
  if (!suggestion.results.length) {
    const departments = await listRoadmapDepartments();

    // Choose best dept by scoreTitleMatch against dept title
    let bestSlug: string | null = null;
    let bestScore = -Infinity;

    for (const d of departments) {
      const slug = extractDeptSlug(d.url);
      if (!slug) continue;
      const score = scoreTitleMatch(majorName, d.title ?? "", year);
      if (score > bestScore) {
        bestScore = score;
        bestSlug = slug;
      }
    }

    if (bestSlug) {
      const roadmaps = await listRoadmapsForDepartment(bestSlug);

      // Score the roadmaps and pick best
      const scored = roadmaps
        .map(r => ({ ...r, score: scoreTitleMatch(majorName, r.title ?? "", year) }))
        .sort((a, b) => b.score - a.score);

      suggestion = { majorName, year, results: scored.slice(0, limit) };
    }
  }

  const best = suggestion.results[0];
  if (!best?.url) {
    throw new Error(
      "No matching roadmap found. Try selecting a major from the dropdown list (so it matches CSUN naming), or try a different year."
    );
  }

  const roadmap = await parseRoadmap(best.url);

  const courses = Array.from(
    new Set(
      roadmap.semesters
        .flatMap(s => s.courses)
        .map(c => c.courseKey)
        .filter(Boolean)
        .map(k => String(k).toUpperCase())
    )
  );

  if (courses.length === 0) {
    throw new Error(
      "Matched a roadmap, but no courses were detected. The roadmap page layout may have changed. Send the matched roadmap URL and I will adjust the parser."
    );
  }

  const graph = await buildRequirementsGraph(courses);

  // Derive catalog URL: try to find it from the roadmap URL pattern
  // e.g. https://catalog.csun.edu/resource/road-map/2024/rtm-bs-tourism-hospitality-2024/
  //  → https://catalog.csun.edu/academics/rtm/programs/bs-tourism-hospitality-and-recreation-management/
  // We store the guessed catalog URL; the controller will use it to fetch electives.
  const catalogUrl = guessCatalogUrlFromRoadmapUrl(best.url, majorName);

  return {
    majorName,
    year,
    catalogUrl,
    matchedRoadmap: { title: best.title, url: best.url },
    roadmap,
    graph,
    courses
  };
}

/**
 * Try to infer the CSUN catalog program page URL from a roadmap resource URL.
 * Example roadmap URL:
 *   https://catalog.csun.edu/resource/road-map/2024/rtm-bs-tourism-hospitality-recreation-management-2024/
 * Inferred catalog URL:
 *   https://catalog.csun.edu/academics/rtm/programs/bs-tourism-hospitality-recreation-management/
 *
 * When inference is uncertain we fall back to a slug derived from the major name.
 */
function guessCatalogUrlFromRoadmapUrl(roadmapUrl: string, majorName: string): string {
  // Extract the slug portion: "rtm-bs-tourism-hospitality-recreation-management-2024"
  const rmMatch = roadmapUrl.match(/\/resource\/road-map\/\d{4}\/([a-z0-9-]+)\/?$/i);
  if (rmMatch) {
    // Strip trailing "-YYYY" year suffix
    const slug = rmMatch[1].replace(/-\d{4}$/, "");
    // First path segment is the department (e.g. "rtm")
    const parts = slug.split("-");
    const dept = parts[0]; // "rtm"
    // Program portion: everything after dept
    const program = parts.slice(1).join("-"); // "bs-tourism-hospitality-recreation-management"
    if (dept && program) {
      return `${CATALOG_ORIGIN}/academics/${dept}/programs/${program}/`;
    }
    return `${CATALOG_ORIGIN}/academics/${slug}/`;
  }
  return guessCatalogUrl(majorName);
}

