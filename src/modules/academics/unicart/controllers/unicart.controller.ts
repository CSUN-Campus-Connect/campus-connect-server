/**
 * unicart.controller.ts
 *
 * Architecture change: scraping moved to browser (unicart.html).
 * Backend receives real scraped data via POST /api/academics/ingest,
 * caches it, and serves it through the existing GET endpoints.
 *
 * New endpoint:
 *   POST /api/academics/ingest
 *   Body: { courses: CatalogCourse[], sections: CourseSection[] }
 *   Called by the browser after scraping CSUN catalog pages.
 */

import type { Request, Response } from "express";

const ALLOWED_PROXY_HOSTS = new Set(["catalog.csun.edu", "www.csun.edu"]);
import {
  fetchDepartments,
  ingestCourses,
  getCachedCoursesByDept,
  searchCachedCatalog,
} from "../services/catalogScraper.service";
import {
  querySections,
  ingestSections,
  enrichSectionsWithCatalog,
  generateICS,
  detectConflicts,
  findSectionById,
  getSupportedSemesters,
  type SectionQuery,
  type CourseSection,
} from "../services/cart.service";

// GET /api/academics/departments
/** Returns the available academic departments. */
export async function getDepartments(_req: Request, res: Response) {
  try {
    const depts = fetchDepartments();
    res.json({ success: true, data: depts });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/academics/catalog/:dept
/** Returns cached catalog courses for one department. */
export async function getCatalogByDept(req: Request, res: Response) {
  try {
    const dept = Array.isArray(req.params.dept) ? req.params.dept[0] : req.params.dept;
    const courses = getCachedCoursesByDept(dept);
    res.json({ success: true, data: courses, count: courses.length });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/academics/catalog/search?q=&depts=
/** Searches cached catalog courses by text. */
export async function searchCatalogEndpoint(req: Request, res: Response) {
  try {
    const q = (req.query.q as string) ?? "";
    const depts = req.query.depts ? (req.query.depts as string).split(",") : undefined;
    const courses = searchCachedCatalog(q, depts);
    res.json({ success: true, data: courses, count: courses.length });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/academics/proxy?url=<encoded-csun-url>
/** Proxies approved CSUN URLs so the frontend can read CSUN responses without CORS errors. */
export async function proxyCSUN(req: Request, res: Response) {
  try {
    const rawUrl = typeof req.query.url === "string" ? req.query.url : "";
    if (!rawUrl) {
      return res.status(400).json({ success: false, error: "url query parameter required" });
    }

    let target: URL;
    try {
      target = new URL(rawUrl);
    } catch {
      return res.status(400).json({ success: false, error: "invalid url" });
    }

    if (target.protocol !== "https:" || !ALLOWED_PROXY_HOSTS.has(target.hostname)) {
      return res.status(400).json({ success: false, error: "only https://catalog.csun.edu and https://www.csun.edu URLs are allowed" });
    }

    const upstream = await fetch(target.toString(), {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (UniCart Proxy)",
        "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
      },
    });

    const contentType = upstream.headers.get("content-type") || "text/plain; charset=utf-8";
    const denyReason = upstream.headers.get("x-deny-reason");
    const body = await upstream.text();

    res.status(upstream.status);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "no-store");
    if (denyReason) res.setHeader("x-csun-deny-reason", denyReason);

    if (!upstream.ok && contentType.includes("application/json")) {
      return res.send(body);
    }

    return res.send(body);
  } catch (err: any) {
    return res.status(502).json({ success: false, error: err?.message || "proxy request failed" });
  }
}

// POST /api/academics/ingest
// Called by unicart.html after scraping CSUN pages in the browser.
// Body: { courses?: CatalogCourse[], sections?: CourseSection[] }
/** Stores browser-scraped courses and sections in cache. */
export async function ingestScrapedData(req: Request, res: Response) {
  try {
    const { courses, sections } = req.body;
    let coursesStored = 0;
    let sectionsStored = 0;

    if (Array.isArray(courses) && courses.length > 0) {
      ingestCourses(courses);
      coursesStored = courses.length;
    }

    if (Array.isArray(sections) && sections.length > 0) {
      sectionsStored = ingestSections(sections as CourseSection[]);
    }

    res.json({
      success: true,
      coursesIngested: coursesStored,
      sectionsIngested: sectionsStored,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/academics/sections
/** Returns section results that match the query filters. */
export async function getSections(req: Request, res: Response) {
  try {
    const query: SectionQuery = {
      semester: (req.query.semester as string) ?? getSupportedSemesters()[0],
      subject: req.query.subject as string | undefined,
      search: req.query.search as string | undefined,
      level: req.query.level as string | undefined,
      tag: req.query.tag as string | undefined,
      days: req.query.days ? (req.query.days as string).split(",") : undefined,
      unitsMin: req.query.unitsMin ? Number(req.query.unitsMin) : undefined,
      unitsMax: req.query.unitsMax ? Number(req.query.unitsMax) : undefined,
      isOnline: req.query.isOnline !== undefined ? req.query.isOnline === "true" : undefined,
      openOnly: req.query.openOnly === "true",
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 50,
    };

    const { sections, total } = await querySections(query);

    if (req.query.enrich === "true" && query.subject) {
      try {
        const catalog = getCachedCoursesByDept(query.subject);
        if (catalog.length) {
          const enriched = enrichSectionsWithCatalog(sections, catalog);
          return res.json({ success: true, data: enriched, total, page: query.page, limit: query.limit });
        }
      } catch {
        // fall through
      }
    }

    res.json({ success: true, data: sections, total, page: query.page, limit: query.limit });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/academics/sections/:sectionId
/** Returns one section by id and semester. */
export async function getSectionById(req: Request, res: Response) {
  try {
    const sectionId =
      typeof req.params.sectionId === "string"
        ? req.params.sectionId
        : req.params.sectionId?.[0];

    const rawSemester = req.query.semester;
    const semester =
      typeof rawSemester === "string"
        ? rawSemester
        : getSupportedSemesters()[0];

    const section = await findSectionById({ sectionId, semester });

    if (!section) {
      return res.status(404).json({ success: false, error: "Section not found" });
    }

    res.json({ success: true, data: section });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /api/academics/conflicts
/** Checks a list of sections for schedule conflicts. */
export async function checkConflicts(req: Request, res: Response) {
  try {
    const { sections } = req.body;
    if (!Array.isArray(sections)) {
      return res.status(400).json({ success: false, error: "sections array required" });
    }
    const conflicts = detectConflicts(sections);
    res.json({ success: true, data: Object.fromEntries(conflicts) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /api/academics/export/ics
/** Exports selected sections as an ICS calendar file. */
export async function exportICS(req: Request, res: Response) {
  try {
    const { sections, semester } = req.body;
    if (!Array.isArray(sections) || !semester) {
      return res.status(400).json({ success: false, error: "sections and semester required" });
    }
    const ics = generateICS(sections, semester);
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${String(semester).replace(/\s+/g, "_")}_schedule.ics"`
    );
    res.send(ics);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/academics/semesters
/** Returns the list of supported semesters. */
export function getSemesters(_req: Request, res: Response) {
  res.json({ success: true, data: getSupportedSemesters() });
}
