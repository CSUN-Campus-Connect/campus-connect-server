/**
 * unicart.controller.ts  v5
 *
 * Endpoints:
 *   GET  /api/academics/departments          → dept list
 *   GET  /api/academics/semesters            → supported semesters
 *   GET  /api/academics/courses/:dept        → all courses for a dept (catalog scrape)
 *   GET  /api/academics/sections             → sections via CSUN Curriculum API
 *   POST /api/academics/conflicts            → conflict check
 *   POST /api/academics/export/ics           → ICS download
 */

import type { Request, Response } from "express";
import {
  fetchDepartments,
  fetchDeptCourses,
  searchSections,
  getSupportedSemesters,
  generateICS,
  type CartEntry,
} from "../services/unicart.service";

// ── GET /api/academics/departments ───────────────────────────────────────────
export async function getDepartments(_req: Request, res: Response) {
  try {
    const data = await fetchDepartments();
    res.json({ success: true, data, count: data.length });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// ── GET /api/academics/semesters ─────────────────────────────────────────────
export function getSemesters(_req: Request, res: Response) {
  res.json({ success: true, data: getSupportedSemesters() });
}

// ── GET /api/academics/courses/:dept ─────────────────────────────────────────
export async function getCoursesByDept(req: Request, res: Response) {
  try {
    const dept = String(req.params.dept ?? "").trim();
    if (!dept) return res.status(400).json({ success: false, error: "dept required" });

    const courses = await fetchDeptCourses(dept);
    res.json({ success: true, data: courses, count: courses.length });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// ── GET /api/academics/sections ──────────────────────────────────────────────
// Query params:
//   subject  — required dept code, e.g. "COMP"
//   search   — optional course filter, e.g. "440" or "comp 440"
//   semester — e.g. "Spring 2026"
//   limit    — max courses to hydrate with sections (default 20)
//   isOnline — "true" | "false"
//   level    — "100s" | "200s" | "300s" | "400s" | "500s+"
export async function getSections(req: Request, res: Response) {
  try {
    const subject  = String(req.query.subject  ?? req.query.dept ?? "").trim().toUpperCase();
    const search   = String(req.query.search   ?? "").trim();
    const semester = String(req.query.semester ?? getSupportedSemesters()[0]).trim();
    const limit    = Math.min(40, Math.max(1, Number(req.query.limit ?? 20)));
    const isOnlineFilter = req.query.isOnline !== undefined
      ? req.query.isOnline === "true"
      : undefined;
    const levelFilter = String(req.query.level ?? "").trim();

    if (!subject) {
      return res.status(400).json({ success: false, error: "subject param required" });
    }

    const raw = await searchSections({ dept: subject, search, semester, limit });

    // Flatten to section-per-row shape that the frontend expects
    const sections: any[] = [];
    for (const course of raw) {
      for (const s of course.sections) {
        if (isOnlineFilter !== undefined && s.isOnline !== isOnlineFilter) continue;
        if (levelFilter && !course.tags.includes(levelFilter)) continue;

        sections.push({
          // IDs
          sectionId:     s.classNumber,
          courseId:      course.courseKey,
          // Course info
          subject:       course.subject,
          number:        course.number,
          title:         course.title,
          units:         course.units,
          semester,
          description:   course.description,
          prerequisites: course.prerequisites ? [course.prerequisites] : [],
          tags:          course.tags,
          // Section info
          professor:     s.instructor ?? "TBA",
          days:          s.days,
          startTime:     s.startTime,
          endTime:       s.endTime,
          location:      s.location,
          isOnline:      s.isOnline,
          rawDays:       s.rawDays,
          rawTime:       s.rawTime,
          // Enrollment data from curriculum API
          seats:         s.enrollMax,
          seatsAvailable: Math.max(0, s.enrollMax - s.enrolled),
          enrolled:      s.enrolled,
          enrollMax:     s.enrollMax,
          waitlistCount: s.waitlisted,
          courseType:    null,
          linkedLab:     null,
          materialCost:  0,
        });
      }
    }

    res.json({ success: true, data: sections, total: sections.length });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// ── POST /api/academics/conflicts ────────────────────────────────────────────
export function checkConflicts(req: Request, res: Response) {
  try {
    const { sections } = req.body;
    if (!Array.isArray(sections)) {
      return res.status(400).json({ success: false, error: "sections array required" });
    }

    const conflicts: Record<string, string[]> = {};
    const inPerson = sections.filter((s: any) => !s.isOnline && s.startTime);

    const toMin = (t: string) => { const [h,m] = t.split(":").map(Number); return h*60+m; };

    for (let i = 0; i < inPerson.length; i++) {
      for (let j = i+1; j < inPerson.length; j++) {
        const a = inPerson[i], b = inPerson[j];
        const sharedDays = (a.days??[]).filter((d:string) => (b.days??[]).includes(d));
        if (!sharedDays.length) continue;
        const aStart = toMin(a.startTime), aEnd = toMin(a.endTime);
        const bStart = toMin(b.startTime), bEnd = toMin(b.endTime);
        if (aStart < bEnd && aEnd > bStart) {
          const ak = `${a.subject} ${a.number}`;
          const bk = `${b.subject} ${b.number}`;
          conflicts[ak] = [...(conflicts[ak]??[]), bk];
          conflicts[bk] = [...(conflicts[bk]??[]), ak];
        }
      }
    }

    res.json({ success: true, data: conflicts });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// ── POST /api/academics/export/ics ───────────────────────────────────────────
export function exportICS(req: Request, res: Response) {
  try {
    const { sections, semester } = req.body;
    if (!Array.isArray(sections) || !semester) {
      return res.status(400).json({ success: false, error: "sections and semester required" });
    }

    const cart: CartEntry[] = sections.map((s: any) => ({
      courseKey: s.courseId ?? `${s.subject}-${s.number}`,
      subject:   s.subject,
      number:    s.number,
      title:     s.title,
      units:     s.units,
      sectionId: s.sectionId,
      days:      s.days ?? [],
      startTime: s.startTime ?? null,
      endTime:   s.endTime ?? null,
      location:  s.location ?? "TBA",
      isOnline:  s.isOnline ?? false,
    }));

    const ics = generateICS(cart, semester);
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${String(semester).replace(/\s+/g,"_")}_schedule.ics"`);
    res.send(ics);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}
