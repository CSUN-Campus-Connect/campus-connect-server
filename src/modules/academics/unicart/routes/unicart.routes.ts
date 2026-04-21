/**
 * unicart.routes.ts
 * FIX: path-to-regexp v8 (router@2.x) rejects bare "*" and "(.*)".
 * Only "/{*name}" works as a catch-all wildcard in this version.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import {
  getDepartments,
  getCatalogByDept,
  searchCatalogEndpoint,
  getSections,
  getSectionById,
  checkConflicts,
  exportICS,
  getSemesters,
  ingestScrapedData,
  proxyCSUN,
} from "../controllers/unicart.controller";

/** Adds a timeout so slow catalog requests fail cleanly. */
function scraperTimeout(_req: Request, res: Response, next: NextFunction) {
  res.setTimeout(30_000, () => {
    if (!res.headersSent) {
      res.status(503).json({ success: false, error: "Request timed out fetching catalog data" });
    }
  });
  next();
}

/** Creates the UniCart API router and registers its endpoints. */
export function unicartRoutes() {
  const router = Router();

  router.options("/{*path}", (_req: Request, res: Response) => res.sendStatus(204));

  router.get("/departments",         scraperTimeout, getDepartments);
  router.get("/catalog/search",      scraperTimeout, searchCatalogEndpoint);
  router.get("/catalog/:dept",       scraperTimeout, getCatalogByDept);
  router.get("/semesters",                           getSemesters);
  router.get("/proxy",               scraperTimeout, proxyCSUN);
  router.post("/ingest",                              ingestScrapedData);
  router.get("/sections",            scraperTimeout, getSections);
  router.get("/sections/:sectionId", scraperTimeout, getSectionById);
  router.post("/conflicts",                          checkConflicts);
  router.post("/export/ics",                         exportICS);

  return router;
}
