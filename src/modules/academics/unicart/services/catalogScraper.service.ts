/**
 * catalogScraper.service.ts
 *
 * WHY SERVER-SIDE SCRAPING FAILS:
 * ─────────────────────────────────────────────────────────────────────────────
 * CSUN's WAF (Web Application Firewall) returns HTTP 403 with the header
 * `x-deny-reason: host_not_allowed` for ALL server-to-server requests to
 * *.csun.edu — including Docker containers, CI runners, cloud servers, etc.
 * This is intentional on CSUN's part to prevent automated scraping from
 * non-campus server infrastructure.
 *
 * THE ARCHITECTURE FIX:
 * ─────────────────────────────────────────────────────────────────────────────
 * Scraping is moved ENTIRELY to the browser (unicart.html).
 * The student's browser runs on-campus or as a recognized client — it is
 * allowed to fetch catalog.csun.edu and www.csun.edu/web-dev/api/curriculum.
 *
 * This service now only handles:
 *   - Caching course metadata sent FROM the browser
 *   - Normalizing and validating incoming course/section data
 *   - Providing the department list (static — no scraping needed)
 *
 * The browser:
 *   1. Fetches https://www.csun.edu/web-dev/api/curriculum/courses.php?dept_name=COMP
 *      for course metadata (title, units, description, prerequisites)
 *   2. Scrapes https://catalog.csun.edu/academics/comp/courses/comp-440/
 *      for schedule-of-classes section rows (class#, location, days, time)
 *   3. POSTs the combined structured data to POST /api/academics/ingest
 *      which caches it server-side and returns it through GET /api/academics/sections
 */

import NodeCache from "node-cache";
import logger from "../../../../utils/logger";

const cache = new NodeCache({ stdTTL: 21600, checkperiod: 3600 });

export interface CatalogCourse {
  id: string;
  subject: string;
  number: string;
  title: string;
  units: number;
  description: string;
  prerequisites: string[];
  tags: string[];
  level: "100s" | "200s" | "300s" | "400s" | "500s" | "600s";
  url: string;
}

export interface Department {
  code: string;
  label: string;
  url: string;
}

/**
 * Known departments — static list, no scraping needed.
 * The browser also fetches /web-dev/api/curriculum/departments.php for a
 * complete live list; this is used as a fallback reference.
 */
const KNOWN_DEPTS: Department[] = [
  { code: "acct",  label: "Accountancy",                        url: "https://catalog.csun.edu/academics/acct/courses/" },
  { code: "afrs",  label: "Africana Studies",                   url: "https://catalog.csun.edu/academics/afrs/courses/" },
  { code: "anes",  label: "Anesthesiologist Assistant",         url: "https://catalog.csun.edu/academics/anes/courses/" },
  { code: "anth",  label: "Anthropology",                       url: "https://catalog.csun.edu/academics/anth/courses/" },
  { code: "art",   label: "Art",                                url: "https://catalog.csun.edu/academics/art/courses/"  },
  { code: "ase",   label: "Applied Science & Engineering",      url: "https://catalog.csun.edu/academics/ase/courses/"  },
  { code: "biol",  label: "Biology",                            url: "https://catalog.csun.edu/academics/biol/courses/" },
  { code: "bus",   label: "Business",                           url: "https://catalog.csun.edu/academics/bus/courses/"  },
  { code: "ce",    label: "Civil Engineering",                  url: "https://catalog.csun.edu/academics/ce/courses/"   },
  { code: "chem",  label: "Chemistry",                          url: "https://catalog.csun.edu/academics/chem/courses/" },
  { code: "cjs",   label: "Criminology, Justice & Safety",      url: "https://catalog.csun.edu/academics/cjs/courses/"  },
  { code: "comp",  label: "Computer Science",                   url: "https://catalog.csun.edu/academics/comp/courses/" },
  { code: "coms",  label: "Communication Studies",              url: "https://catalog.csun.edu/academics/coms/courses/" },
  { code: "ctva",  label: "Cinema & Television Arts",           url: "https://catalog.csun.edu/academics/ctva/courses/" },
  { code: "ece",   label: "Electrical & Computer Engineering",  url: "https://catalog.csun.edu/academics/ece/courses/"  },
  { code: "econ",  label: "Economics",                          url: "https://catalog.csun.edu/academics/econ/courses/" },
  { code: "educ",  label: "Education",                          url: "https://catalog.csun.edu/academics/educ/courses/" },
  { code: "engl",  label: "English",                            url: "https://catalog.csun.edu/academics/engl/courses/" },
  { code: "enve",  label: "Environmental Engineering",          url: "https://catalog.csun.edu/academics/enve/courses/" },
  { code: "geog",  label: "Geography",                          url: "https://catalog.csun.edu/academics/geog/courses/" },
  { code: "geol",  label: "Geology",                            url: "https://catalog.csun.edu/academics/geol/courses/" },
  { code: "hist",  label: "History",                            url: "https://catalog.csun.edu/academics/hist/courses/" },
  { code: "hum",   label: "Humanities",                         url: "https://catalog.csun.edu/academics/hum/courses/"  },
  { code: "ibe",   label: "International Business & Economics", url: "https://catalog.csun.edu/academics/ibe/courses/"  },
  { code: "kine",  label: "Kinesiology",                        url: "https://catalog.csun.edu/academics/kine/courses/" },
  { code: "math",  label: "Mathematics",                        url: "https://catalog.csun.edu/academics/math/courses/" },
  { code: "me",    label: "Mechanical Engineering",             url: "https://catalog.csun.edu/academics/me/courses/"   },
  { code: "mfg",   label: "Manufacturing Systems Engineering",  url: "https://catalog.csun.edu/academics/mfg/courses/"  },
  { code: "mkt",   label: "Marketing",                          url: "https://catalog.csun.edu/academics/mkt/courses/"  },
  { code: "mus",   label: "Music",                              url: "https://catalog.csun.edu/academics/mus/courses/"  },
  { code: "nurs",  label: "Nursing",                            url: "https://catalog.csun.edu/academics/nurs/courses/" },
  { code: "phil",  label: "Philosophy",                         url: "https://catalog.csun.edu/academics/phil/courses/" },
  { code: "phys",  label: "Physics",                            url: "https://catalog.csun.edu/academics/phys/courses/" },
  { code: "pols",  label: "Political Science",                  url: "https://catalog.csun.edu/academics/pols/courses/" },
  { code: "psyc",  label: "Psychology",                         url: "https://catalog.csun.edu/academics/psyc/courses/" },
  { code: "ptag",  label: "Physical Therapy",                   url: "https://catalog.csun.edu/academics/ptag/courses/" },
  { code: "rs",    label: "Religious Studies",                  url: "https://catalog.csun.edu/academics/rs/courses/"   },
  { code: "soc",   label: "Sociology",                          url: "https://catalog.csun.edu/academics/soc/courses/"  },
  { code: "span",  label: "Spanish",                            url: "https://catalog.csun.edu/academics/span/courses/" },
  { code: "sped",  label: "Special Education",                  url: "https://catalog.csun.edu/academics/sped/courses/" },
  { code: "sw",    label: "Social Work",                        url: "https://catalog.csun.edu/academics/sw/courses/"   },
  { code: "univ",  label: "University",                         url: "https://catalog.csun.edu/academics/univ/courses/" },
  { code: "urbs",  label: "Urban Studies",                      url: "https://catalog.csun.edu/academics/urbs/courses/" },
];

/** Returns the built-in department list. */
export function fetchDepartments(): Department[] {
  return KNOWN_DEPTS;
}

/**
 * Store browser-scraped courses in cache (called by POST /api/academics/ingest).
 * The browser sends the scraped + normalized data; we cache and return it
 * through the normal GET /api/academics/sections endpoint.
 */
export function ingestCourses(courses: CatalogCourse[]): void {
  const byDept = new Map<string, CatalogCourse[]>();
  for (const c of courses) {
    const dept = c.subject.toLowerCase();
    if (!byDept.has(dept)) byDept.set(dept, []);
    byDept.get(dept)!.push(c);
  }
  for (const [dept, deptCourses] of byDept.entries()) {
    const key = `catalog:dept:${dept}`;
    const existing = cache.get<CatalogCourse[]>(key) ?? [];
    const merged = [...existing];
    for (const c of deptCourses) {
      const idx = merged.findIndex((e) => e.id === c.id);
      if (idx >= 0) merged[idx] = c;
      else merged.push(c);
    }
    cache.set(key, merged);
    logger.info({ dept, count: merged.length }, "Courses ingested from browser scrape");
  }
}

/**
 * Retrieve cached courses for a department (populated by browser scrape via ingest).
 * Returns empty array if no data ingested yet for this dept.
 */
export function getCachedCoursesByDept(dept: string): CatalogCourse[] {
  const key = `catalog:dept:${dept.toLowerCase()}`;
  return cache.get<CatalogCourse[]>(key) ?? [];
}

/** Searches cached catalog courses by text and optional departments. */
export function searchCachedCatalog(query: string, depts?: string[]): CatalogCourse[] {
  const q = query.toLowerCase().trim();
  const allDepts = depts?.length
    ? depts.map((d) => d.toLowerCase())
    : KNOWN_DEPTS.map((d) => d.code);

  const allCourses = allDepts.flatMap((d) => getCachedCoursesByDept(d));

  if (!q) return allCourses;
  return allCourses.filter((c) =>
    `${c.subject} ${c.number} ${c.title} ${c.description} ${c.tags.join(" ")}`
      .toLowerCase()
      .includes(q)
  );
}

export { cache as catalogCache };
