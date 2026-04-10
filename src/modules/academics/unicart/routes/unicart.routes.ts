/**
 * academics.routes.ts
 */

import { Router } from "express";
import {
  getDepartments,
  getCatalogByDept,
  searchCatalogEndpoint,
  getSections,
  getSectionById,
  checkConflicts,
  exportICS,
  getSemesters,
} from "../controllers/unicart.controller";

export function unicartRoutes() {
  const router = Router();

  // Catalog (scraped from catalog.csun.edu)
  router.get("/departments",          getDepartments);
  router.get("/catalog/search",       searchCatalogEndpoint);
  router.get("/catalog/:dept",        getCatalogByDept);

  // Sections / enrollment
  router.get("/semesters",            getSemesters);
  router.get("/sections",             getSections);
  router.get("/sections/:sectionId",  getSectionById);

  // Utilities
  router.post("/conflicts",           checkConflicts);
  router.post("/export/ics",          exportICS);

  return router;
}
