import { Router } from "express";
import { getSchedule, getEvents } from "./src.controller";

const router = Router();

/**
 * SRC (Student Recreation Center) Routes
 */

// GET /api/v1/src/schedule - Fetch SRC schedule
router.get("/schedule", getSchedule);

// GET /api/v1/src/events - Fetch SRC events
router.get("/events", getEvents);

export default router;
