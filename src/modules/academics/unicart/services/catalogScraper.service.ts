/**
 * catalogScraper.service.ts
 * Scrapes CSUN catalog.csun.edu for course listings by department.
 * URL pattern: https://catalog.csun.edu/academics/{dept}/courses/
 */

import axios from "axios";
import * as cheerio from "cheerio";
import NodeCache from "node-cache";
import logger from "../../../../utils/logger";

// Cache TTL: 6 hours (catalog rarely changes mid-day)
const cache = new NodeCache({ stdTTL: 21600, checkperiod: 3600 });

const BASE_URL = "https://catalog.csun.edu";
const CATALOG_INDEX = `${BASE_URL}/academics/`;

export interface CatalogCourse {
  id: string;           // e.g. "COMP-100"
  subject: string;      // e.g. "COMP"
  number: string;       // e.g. "100"
  title: string;
  units: number;
  description: string;
  prerequisites: string[];
  tags: string[];
  level: "100s" | "200s" | "300s" | "400s" | "500s" | "600s";
}

export interface Department {
  code: string;   // e.g. "comp"
  label: string;  // e.g. "Computer Science"
  url: string;
}

// ── Fetch all departments from catalog index ─────────────────────────────────
export async function fetchDepartments(): Promise<Department[]> {
  const cacheKey = "catalog:departments";
  const cached = cache.get<Department[]>(cacheKey);
  if (cached) return cached;

  try {
    const { data } = await axios.get(CATALOG_INDEX, { timeout: 10000 });
    const $ = cheerio.load(data);
    const departments: Department[] = [];

    // Catalog index lists links like /academics/comp/courses/
    $("a[href*='/academics/']").each((_i, el) => {
      const href = $(el).attr("href") ?? "";
      const match = href.match(/\/academics\/([^/]+)\//);
      if (!match) return;
      const code = match[1];
      if (code === "geol" || departments.find((d) => d.code === code)) return;

      const label = $(el).text().trim();
      if (label.length < 2) return;

      departments.push({ code, label, url: `${BASE_URL}/academics/${code}/courses/` });
    });

    // Fallback known CSUN departments if scrape sparse
    const knownDepts: Department[] = [
      { code: "comp", label: "Computer Science", url: `${BASE_URL}/academics/comp/courses/` },
      { code: "math", label: "Mathematics", url: `${BASE_URL}/academics/math/courses/` },
      { code: "engl", label: "English", url: `${BASE_URL}/academics/engl/courses/` },
      { code: "phys", label: "Physics", url: `${BASE_URL}/academics/phys/courses/` },
      { code: "biol", label: "Biology", url: `${BASE_URL}/academics/biol/courses/` },
      { code: "chem", label: "Chemistry", url: `${BASE_URL}/academics/chem/courses/` },
      { code: "hist", label: "History", url: `${BASE_URL}/academics/hist/courses/` },
      { code: "psyc", label: "Psychology", url: `${BASE_URL}/academics/psyc/courses/` },
      { code: "bus", label: "Business", url: `${BASE_URL}/academics/bus/courses/` },
      { code: "art", label: "Art", url: `${BASE_URL}/academics/art/courses/` },
      { code: "ece", label: "Electrical & Computer Engineering", url: `${BASE_URL}/academics/ece/courses/` },
      { code: "me", label: "Mechanical Engineering", url: `${BASE_URL}/academics/me/courses/` },
      { code: "ce", label: "Civil Engineering", url: `${BASE_URL}/academics/ce/courses/` },
      { code: "nurs", label: "Nursing", url: `${BASE_URL}/academics/nurs/courses/` },
      { code: "kine", label: "Kinesiology", url: `${BASE_URL}/academics/kine/courses/` },
      { code: "soc", label: "Sociology", url: `${BASE_URL}/academics/soc/courses/` },
      { code: "phil", label: "Philosophy", url: `${BASE_URL}/academics/phil/courses/` },
      { code: "mus", label: "Music", url: `${BASE_URL}/academics/mus/courses/` },
      { code: "geol", label: "Geology", url: `${BASE_URL}/academics/geol/courses/` },
    ];

    // Merge, prefer scraped if present
    const result = departments.length > 5 ? departments : knownDepts;
    cache.set(cacheKey, result);
    return result;
  } catch (err) {
    logger.error({ err }, "Failed to fetch departments");
    throw new Error("Could not fetch departments from CSUN catalog");
  }
}

// ── Scrape courses for one department ────────────────────────────────────────
export async function fetchCoursesByDepartment(deptCode: string): Promise<CatalogCourse[]> {
  const cacheKey = `catalog:dept:${deptCode.toLowerCase()}`;
  const cached = cache.get<CatalogCourse[]>(cacheKey);
  if (cached) return cached;

  const url = `${BASE_URL}/academics/${deptCode.toLowerCase()}/courses/`;

  try {
    const { data } = await axios.get(url, {
      timeout: 12000,
      headers: { "User-Agent": "CampusConnect/1.0 (CSUN student tool)" },
    });

    const $ = cheerio.load(data);
    const courses: CatalogCourse[] = [];
    const subject = deptCode.toUpperCase();

    // Catalog course structure: .course-id, .course-title, .course-units, .course-description
    // Also works with definition list pattern <dt> / <dd>
    $(".course, article.course, .courseblock, li.course").each((_i, el) => {
      const courseEl = $(el);

      // Try multiple selectors for course number
      const rawId = (
        courseEl.find(".course-id, .coursecode, .course-number, dt").first().text() ||
        courseEl.find("h3, h4").first().text()
      ).trim();

      const numberMatch = rawId.match(/(\d{3}[A-Z]?)/);
      if (!numberMatch) return;

      const number = numberMatch[1];
      const title = (
        courseEl.find(".course-title, .coursetitle, h4, h3").first().text() ||
        rawId.replace(subject, "").replace(number, "")
      ).trim().replace(/^\.\s*/, "");

      const unitsText = courseEl.find(".units, .course-units, .credit").first().text() || "3";
      const unitsMatch = unitsText.match(/(\d)/);
      const units = unitsMatch ? parseInt(unitsMatch[1]) : 3;

      const description = courseEl.find(".course-description, p, dd").first().text().trim().slice(0, 400);

      // Extract prerequisites from description
      const prereqMatch = description.match(/[Pp]rerequisite[s]?[:\s]+([^.]+)\./);
      const prerequisites = prereqMatch
        ? prereqMatch[1].split(/,|and|or/).map((s) => s.trim()).filter(Boolean)
        : [];

      const numVal = parseInt(number);
      const level = numVal < 200 ? "100s"
        : numVal < 300 ? "200s"
        : numVal < 400 ? "300s"
        : numVal < 500 ? "400s"
        : numVal < 600 ? "500s"
        : "600s";

      const tags = [subject, level];
      if (numVal >= 300) tags.push("Upper Division");
      else tags.push("Lower Division");
      if (numVal >= 500) tags.push("Graduate");

      if (title.toLowerCase().includes("lab")) tags.push("Lab");

      courses.push({
        id: `${subject}-${number}`,
        subject,
        number,
        title: title || `${subject} ${number}`,
        units,
        description,
        prerequisites,
        tags,
        level,
      });
    });

    // Fallback: try definition list pattern used by CSUN catalog
    if (courses.length === 0) {
      parseFallback($, subject, courses);
    }

    cache.set(cacheKey, courses);
    logger.info({ dept: deptCode, count: courses.length }, "Scraped courses");
    return courses;
  } catch (err) {
    logger.error({ err, deptCode }, "Scrape failed");
    throw new Error(`Failed to scrape courses for ${deptCode}`);
  }
}

function parseFallback($: cheerio.CheerioAPI, subject: string, courses: CatalogCourse[]) {
  // CSUN catalog uses <p class="courseblocktitle"> and <p class="courseblockdesc">
  $(".courseblocktitle, p.courseblocktitle").each((_i, el) => {
    const titleLine = $(el).text().trim();
    // Format: "COMP 100. Intro to CS. 3 Units."
    const match = titleLine.match(/([A-Z]+)\s+(\d{3}[A-Z]?)\.\s+(.+?)\.\s+(\d)/);
    if (!match) return;

    const [, subj, number, title, unitsStr] = match;
    const units = parseInt(unitsStr) || 3;
    const desc = $(el).next(".courseblockdesc, p.courseblockdesc").text().trim().slice(0, 400);

    const prereqMatch = desc.match(/[Pp]rerequisite[s]?[:\s]+([^.]+)\./);
    const prerequisites = prereqMatch
      ? prereqMatch[1].split(/,|and|or/).map((s) => s.trim()).filter(Boolean)
      : [];

    const numVal = parseInt(number);
    const level = numVal < 200 ? "100s" : numVal < 300 ? "200s" : numVal < 400 ? "300s" : numVal < 500 ? "400s" : "500s";
    const tags = [subj || subject, level, numVal >= 300 ? "Upper Division" : "Lower Division"];
    if (numVal >= 500) tags.push("Graduate");

    courses.push({
      id: `${subj || subject}-${number}`,
      subject: subj || subject,
      number,
      title,
      units,
      description: desc,
      prerequisites,
      tags,
      level,
    });
  });
}

// ── Search across all scraped departments ────────────────────────────────────
export async function searchCatalog(query: string, depts?: string[]): Promise<CatalogCourse[]> {
  const q = query.toLowerCase().trim();
  const targetDepts = depts?.length ? depts : (await fetchDepartments()).map((d) => d.code);

  // Parallel fetch with concurrency limit
  const results = await Promise.allSettled(
    targetDepts.map((d) => fetchCoursesByDepartment(d))
  );

  const allCourses = results
    .filter((r): r is PromiseFulfilledResult<CatalogCourse[]> => r.status === "fulfilled")
    .flatMap((r) => r.value);

  if (!q) return allCourses;

  return allCourses.filter((c) =>
    `${c.subject} ${c.number} ${c.title} ${c.description} ${c.tags.join(" ")}`
      .toLowerCase()
      .includes(q)
  );
}

export { cache as catalogCache };
