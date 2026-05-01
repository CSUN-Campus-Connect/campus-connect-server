// src/modules/event/external/StudentRecCenter/studentRecCenter.controller.ts
//
// FIX (2026-05-01):
//  - Cast req.params.uid to string (fixes ts(2345) type error shown in screenshot)
//  - All routes unchanged functionally

import { Router, Request, Response, NextFunction } from "express";
import { StudentRecCenterService } from "./studentRecCenter.service";
import {
  AddToCalendarDto,
  SaveScheduleClassDto,
  SRCClassCategory,
} from "./studentRecCenter.types";

const router = Router();

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// GET /events
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

// GET /events/:uid  — FIX: String() cast removes ts(2345) error
router.get(
  "/events/:uid",
  asyncHandler(async (req, res) => {
    const uid   = String(req.params.uid);   // ← was req.params.uid (string | string[])
    const event = await StudentRecCenterService.getEventByUid(uid);
    if (!event) {
      res.status(404).json({ success: false, message: "Event not found" });
      return;
    }
    res.json({ success: true, data: event });
  })
);

// GET /schedule
router.get(
  "/schedule",
  asyncHandler(async (req, res) => {
    const { day, week } = req.query as Record<string, string>;
    const classes = await StudentRecCenterService.getScheduleClasses({ day, week });
    res.json({ success: true, count: classes.length, data: classes });
  })
);

// POST /calendar/add
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

// POST /schedule/save
router.post(
  "/schedule/save",
  asyncHandler(async (req, res) => {
    const userId: string = (req as any).user?.id ?? "anonymous";
    const dto: SaveScheduleClassDto = req.body;
    if (!dto.classId || !dto.weekStart) {
      res.status(400).json({ success: false, message: "classId and weekStart are required" });
      return;
    }
    const result = await StudentRecCenterService.saveScheduleClass(userId, dto);
    if (!result.success) {
      res.status(409).json(result);
      return;
    }
    res.status(201).json(result);
  })
);

// GET /feed.ics
router.get(
  "/feed.ics",
  asyncHandler(async (_req, res) => {
    const ics = await StudentRecCenterService.getRawIcs();
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.send(ics);
  })
);

// POST /cache/invalidate
router.post(
  "/cache/invalidate",
  asyncHandler(async (_req, res) => {
    StudentRecCenterService.invalidateCache();
    res.json({ success: true, message: "Cache invalidated" });
  })
);

export default router;
