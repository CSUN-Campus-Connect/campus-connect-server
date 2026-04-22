/**
 * unicart.routes.ts — No proxy. No ingest. Pure direct-scrape endpoints.
 */
import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import {
  getDepartments,
  getSemesters,
  getCoursesByDept,
  getSections,
  checkConflicts,
  exportICS,
} from "../controllers/unicart.controller";

const timeout = (ms: number) => (_req: Request, res: Response, next: NextFunction) => {
  res.setTimeout(ms, () => { if (!res.headersSent) res.status(503).json({ success:false, error:"Timeout" }); });
  next();
};

export function unicartRoutes() {
  const r = Router();
  r.options("/{*path}", (_req, res) => res.sendStatus(204));
  r.get("/departments",       timeout(15_000), getDepartments);
  r.get("/semesters",                          getSemesters);
  r.get("/courses/:dept",     timeout(20_000), getCoursesByDept);
  r.get("/sections",          timeout(60_000), getSections);   // can scrape multiple pages
  r.post("/conflicts",                         checkConflicts);
  r.post("/export/ics",                        exportICS);
  return r;
}
