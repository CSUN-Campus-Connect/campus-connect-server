import { Router } from "express";
import { listCsunUsuEvents } from "./csunUsu.controller";

const router = Router();

// GET /api/v1/csun-usu?daysAhead=7
// The frontend widget fetches /api/v1/csun-usu — next.config.ts rewrites
// /api/v1/:path* → backend:8000/api/v1/:path* so this route is reached correctly.
router.get("/csun-usu", listCsunUsuEvents);

export default router;
