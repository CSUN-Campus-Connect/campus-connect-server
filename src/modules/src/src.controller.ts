import { Request, Response } from "express";
import { getSrcSchedule, getSrcEvents } from "./src.service";
import logger from "../../utils/logger";

/**
 * GET /api/v1/src/schedule
 * Fetch SRC schedule items (classes, activities, etc)
 */
export const getSchedule = async (req: Request, res: Response): Promise<void> => {
  try {
    const { week, day } = req.query;
    const schedule = await getSrcSchedule({ week: week as string, day: day as string });
    res.json({ data: schedule });
  } catch (error) {
    logger.error({ error, context: "getSrcSchedule" });
    res.status(500).json({ error: "Failed to fetch SRC schedule" });
  }
};

/**
 * GET /api/v1/src/events
 * Fetch SRC events
 */
export const getEvents = async (req: Request, res: Response): Promise<void> => {
  try {
    const events = await getSrcEvents();
    res.json({ data: events });
  } catch (error) {
    logger.error({ error, context: "getSrcEvents" });
    res.status(500).json({ error: "Failed to fetch SRC events" });
  }
};
