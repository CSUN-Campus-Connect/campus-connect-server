import { Request, Response, NextFunction } from "express";
import * as sundialService from "./sundial.service";
import { SundialNewsCategory } from "@prisma/client";
import logger from "@/utils/logger";

const parseLimit = (raw: unknown) => {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
};

/**
 * GET /api/v1/sundial/queryByDateRange?rangeStart=...&rangeEnd=...&category=...&limit=...
 * Query sundial news articles by date range, with optional category filter.
 */
export const getNewsByDateRangeHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const rangeStart = new Date(req.query.rangeStart as string);
    const rangeEnd = new Date(req.query.rangeEnd as string);

    if (isNaN(rangeStart.getTime()) || isNaN(rangeEnd.getTime())) {
      res.status(400).json({
        error: "Validation failed",
        details: [
          {
            path: "query.rangeStart / query.rangeEnd",
            message: "Invalid date format. Use ISO 8601 (e.g. 2026-04-01)",
          },
        ],
      });
      return;
    }

    if (rangeEnd < rangeStart) {
      res.status(400).json({
        error: "Validation failed",
        details: [
          {
            path: "query.rangeEnd",
            message: "rangeEnd must be on or after rangeStart",
          },
        ],
      });
      return;
    }

    const category = req.query.category as string | undefined;
    if (
      category &&
      !Object.values(SundialNewsCategory).includes(
        category as SundialNewsCategory
      )
    ) {
      res.status(400).json({
        error: "Validation failed",
        details: [
          {
            path: "query.category",
            message: `Invalid category. Must be one of: ${Object.values(SundialNewsCategory).join(", ")}`,
          },
        ],
      });
      return;
    }

    const result = await sundialService.getNewsByDateRange({
      rangeStart,
      rangeEnd,
      category: category as SundialNewsCategory | undefined,
      limit: parseLimit(req.query.limit),
    });

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.status(200).json(result);
  } catch (error) {
    logger.error(error, "sundial.get_by_date_range.failed");
    next(error);
  }
};

/**
 * GET /api/v1/sundial?limit=...
 * Retrieve the latest sundial news articles.
 */
export const getAllNewsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await sundialService.getAllNews({
      limit: parseLimit(req.query.limit),
    });
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.status(200).json(result);
  } catch (error) {
    logger.error(error, "sundial.get_all.failed");
    next(error);
  }
};
