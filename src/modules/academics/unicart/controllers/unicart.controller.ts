/**
 * academics.controller.ts
 */

import type { Request, Response } from "express";
import {
  fetchDepartments,
  fetchCoursesByDepartment,
  searchCatalog,
} from "../services/catalogScraper.service";
import {
  querySections,
  enrichSectionsWithCatalog,
  generateICS,
  detectConflicts,
  sectionStore,
  type SectionQuery,
} from "../services/enrollment.service";

// GET /api/academics/departments
export async function getDepartments(req: Request, res: Response) {
  try {
    const depts = await fetchDepartments();
    res.json({ success: true, data: depts });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/academics/catalog/:dept
export async function getCatalogByDept(req: Request, res: Response) {
  try {
    const dept = Array.isArray(req.params.dept) ? req.params.dept[0] : req.params.dept;
    const courses = await fetchCoursesByDepartment(dept);
    res.json({ success: true, data: courses, count: courses.length });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/academics/catalog/search?q=&depts=
export async function searchCatalogEndpoint(req: Request, res: Response) {
  try {
    const q = (req.query.q as string) ?? "";
    const depts = req.query.depts ? (req.query.depts as string).split(",") : undefined;
    const courses = await searchCatalog(q, depts);
    res.json({ success: true, data: courses, count: courses.length });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/academics/sections
export async function getSections(req: Request, res: Response) {
  try {
    const query: SectionQuery = {
      semester: (req.query.semester as string) ?? "Spring 2026",
      subject:   req.query.subject  as string | undefined,
      search:    req.query.search   as string | undefined,
      level:     req.query.level    as string | undefined,
      tag:       req.query.tag      as string | undefined,
      days:      req.query.days     ? (req.query.days as string).split(",") : undefined,
      unitsMin:  req.query.unitsMin ? Number(req.query.unitsMin) : undefined,
      unitsMax:  req.query.unitsMax ? Number(req.query.unitsMax) : undefined,
      isOnline:  req.query.isOnline !== undefined ? req.query.isOnline === "true" : undefined,
      openOnly:  req.query.openOnly === "true",
      page:      req.query.page  ? Number(req.query.page)  : 1,
      limit:     req.query.limit ? Number(req.query.limit) : 50,
    };

    const { sections, total } = querySections(query);

    // Optionally enrich with catalog data
    if (req.query.enrich === "true" && query.subject) {
      try {
        const catalog = await fetchCoursesByDepartment(query.subject);
        const enriched = enrichSectionsWithCatalog(sections, catalog);
        return res.json({ success: true, data: enriched, total, page: query.page, limit: query.limit });
      } catch {
        // If catalog scrape fails, return un-enriched
      }
    }

    res.json({ success: true, data: sections, total, page: query.page, limit: query.limit });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/academics/sections/:sectionId
export async function getSectionById(req: Request, res: Response) {
  const { sectionId } = req.params;
  const semester = (req.query.semester as string) ?? "Spring 2026";
  const section = sectionStore.find(
    (s) => s.sectionId === sectionId && s.semester === semester
  );
  if (!section) return res.status(404).json({ success: false, error: "Section not found" });
  res.json({ success: true, data: section });
}

// POST /api/academics/conflicts
// Body: { sections: CourseSection[] }
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
// Body: { sections: CourseSection[], semester: string }
export async function exportICS(req: Request, res: Response) {
  try {
    const { sections, semester } = req.body;
    if (!Array.isArray(sections) || !semester) {
      return res.status(400).json({ success: false, error: "sections and semester required" });
    }
    const ics = generateICS(sections, semester);
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${semester.replace(/\s+/g, "_")}_schedule.ics"`);
    res.send(ics);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/academics/semesters
export function getSemesters(_req: Request, res: Response) {
  const semesters = [...new Set(sectionStore.map((s) => s.semester))];
  res.json({ success: true, data: semesters });
}
