// src/modules/event/external/StudentRecCenter/studentRecCenter.controller.ts
//
// Express router that mounts under:
//   /event/external/src
//
// Register in your main event router:
//   import srcRouter from "./external/StudentRecCenter/studentRecCenter.controller";
//   router.use("/src", srcRouter);

import { Router, Request, Response, NextFunction } from "express";
import { StudentRecCenterService } from "./studentRecCenter.service";
import {
  AddToCalendarDto,
  SaveScheduleClassDto,
  SRCClassCategory,
} from "./studentRecCenter.types";

const router = Router();

// ── Helper ───────────────────────────────────────────────────────────────────
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// ── GET /event/external/src/events ───────────────────────────────────────────
// Query params: category, from (ISO date), to (ISO date), search
router.get(
  "/events",
  asyncHandler(async (req, res) => {
    const { category, from, to, search } = req.query as Record<string, string>;

    const events = await StudentRecCenterService.getFilteredEvents({
      category: category as SRCClassCategory | undefined,
      from,
      to,
      search,
    });

    res.json({ success: true, count: events.length, data: events });
  })
);

// ── GET /event/external/src/events/:uid ──────────────────────────────────────
router.get(
  "/events/:uid",
  asyncHandler(async (req, res) => {
    const event = await StudentRecCenterService.getEventByUid(req.params.uid);
    if (!event) {
      res.status(404).json({ success: false, message: "Event not found" });
      return;
    }
    res.json({ success: true, data: event });
  })
);

// ── GET /event/external/src/schedule ─────────────────────────────────────────
// Query params: day (e.g. "Monday"), week (ISO date for week's Sunday)
router.get(
  "/schedule",
  asyncHandler(async (req, res) => {
    const { day, week } = req.query as Record<string, string>;

    const classes = await StudentRecCenterService.getScheduleClasses({ day, week });

    res.json({ success: true, count: classes.length, data: classes });
  })
);

// ── POST /event/external/src/calendar/add ────────────────────────────────────
// Body: AddToCalendarDto
router.post(
  "/calendar/add",
  asyncHandler(async (req, res) => {
    const dto: AddToCalendarDto = req.body;

    if (!dto.eventUid || !dto.userEmail) {
      res.status(400).json({ success: false, message: "eventUid and userEmail are required" });
      return;
    }

    const result = await StudentRecCenterService.addToCalendar(dto);

    res.status(result.success ? 200 : 404).json(result);
  })
);

// ── POST /event/external/src/schedule/save ───────────────────────────────────
// Body: SaveScheduleClassDto
// Auth: expects req.user.id to be set by your auth middleware
router.post(
  "/schedule/save",
  asyncHandler(async (req, res) => {
    // TODO: replace with your real auth middleware check
    const userId: string = (req as any).user?.id ?? "anonymous";

    const dto: SaveScheduleClassDto = req.body;

    if (!dto.classId || !dto.weekStart) {
      res.status(400).json({ success: false, message: "classId and weekStart are required" });
      return;
    }

    const result = await StudentRecCenterService.saveScheduleClass(userId, dto);

    if (!result.success) {
      // 409 = already saved
      res.status(409).json(result);
      return;
    }

    res.status(201).json(result);
  })
);

// ── GET /event/external/src/feed.ics ─────────────────────────────────────────
// Raw ICS proxy — avoids CORS on the client
router.get(
  "/feed.ics",
  asyncHandler(async (_req, res) => {
    const ics = await StudentRecCenterService.getRawIcs();
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.send(ics);
  })
);

// ── POST /event/external/src/cache/invalidate ────────────────────────────────
// Admin-only: bust in-memory cache
router.post(
  "/cache/invalidate",
  asyncHandler(async (_req, res) => {
    StudentRecCenterService.invalidateCache();
    res.json({ success: true, message: "Cache invalidated" });
  })
);

export default router;
