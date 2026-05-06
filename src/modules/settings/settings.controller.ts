/**
 * Settings Controller
 */

import { Request, Response, NextFunction } from "express";
import * as settingsService from "./settings.service";
import logger from "../../utils/logger";

// Notification Preferences 
// GET /api/v1/settings/notifications
export const getNotificationPreferencesHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      logger.warn({ route: req.originalUrl }, "settings.notifications.fetch.unauthorized");
      return res.status(401).json({ message: "Unauthorized" });
    }

    const preferences = await settingsService.getNotificationPreferences(userId);

    logger.info({ userId }, "settings.notifications.fetch.success");

    return res.status(200).json({ data: preferences });

  } catch (error) {
    logger.error(error, "settings.notifications.fetch.failed");
    next(error);
  }
};

// PATCH /api/v1/settings/notifications
export const updateNotificationPreferencesHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      logger.warn({ route: req.originalUrl }, "settings.notifications.update.unauthorized");
      return res.status(401).json({ message: "Unauthorized" });
    }

    const updated = await settingsService.updateNotificationPreferences(
      userId,
      req.body
    );

    logger.info({ userId }, "settings.notifications.update.success");

    return res.status(200).json({
      message: "Notification preferences updated",
      data: updated,
    });

  } catch (error) {
    logger.error(error, "settings.notifications.update.failed");
    next(error);
  }
};

// Appearance Preferences 
// GET /api/v1/settings/appearance
export const getAppearancePreferencesHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      logger.warn({ route: req.originalUrl }, "settings.appearance.fetch.unauthorized");
      return res.status(401).json({ message: "Unauthorized" });
    }

    const preferences = await settingsService.getAppearancePreferences(userId);

    logger.info({ userId }, "settings.appearance.fetch.success");

    return res.status(200).json({ data: preferences });

  } catch (error) {
    logger.error(error, "settings.appearance.fetch.failed");
    next(error);
  }
};

// PATCH /api/v1/settings/appearance
export const updateAppearancePreferencesHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      logger.warn({ route: req.originalUrl }, "settings.appearance.update.unauthorized");
      return res.status(401).json({ message: "Unauthorized" });
    }

    const updated = await settingsService.updateAppearancePreferences(
      userId,
      req.body
    );

    logger.info({ userId }, "settings.appearance.update.success");

    return res.status(200).json({
      message: "Appearance preferences updated",
      data: updated,
    });

  } catch (error) {
    logger.error(error, "settings.appearance.update.failed");
    next(error);
  }
};

// Privacy Preferences
// GET /api/v1/settings/privacy
export const getPrivacyPreferencesHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      logger.warn({ route: req.originalUrl }, "settings.privacy.fetch.unauthorized");
      return res.status(401).json({ message: "Unauthorized" });
    }

    const preferences = await settingsService.getPrivacyPreferences(userId);

    logger.info({ userId }, "settings.privacy.fetch.success");

    return res.status(200).json({ data: preferences });

  } catch (error) {
    logger.error(error, "settings.privacy.fetch.failed");
    next(error);
  }
};

// PATCH /api/v1/settings/privacy
export const updatePrivacyPreferencesHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      logger.warn({ route: req.originalUrl }, "settings.privacy.update.unauthorized");
      return res.status(401).json({ message: "Unauthorized" });
    }

    const updated = await settingsService.updatePrivacyPreferences(
      userId,
      req.body
    );

    logger.info({ userId }, "settings.privacy.update.success");

    return res.status(200).json({
      message: "Privacy preferences updated",
      data: updated,
    });

  } catch (error) {
    logger.error(error, "settings.privacy.update.failed");
    next(error);
  }
};

// Blocked Users
// GET /api/v1/settings/blocked
export const getBlockedUsersHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      logger.warn({ route: req.originalUrl }, "settings.blocked.fetch.unauthorized");
      return res.status(401).json({ message: "Unauthorized" });
    }

    const blockedUsers = await settingsService.getBlockedUsers(userId);

    logger.info({ userId }, "settings.blocked.fetch.success");

    return res.status(200).json({ data: blockedUsers });
  } catch (error) {
    logger.error(error, "settings.blocked.fetch.failed");
    next(error);
  }
};

// POST /api/v1/settings/blocked/:userId
export const blockUserHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const blockerId = (req as any).user?.id;
    const blockedId  = req.params.userId as string;

    if (!blockerId) {
      logger.warn({ route: req.originalUrl }, "settings.blocked.block.unauthorized");
      return res.status(401).json({ message: "Unauthorized" });
    }

    await settingsService.blockUser(blockerId, blockedId);

    logger.info({ blockerId, blockedId }, "settings.blocked.block.success");

    return res.status(201).json({ message: "User blocked successfully" });
  } catch (error: any) {
    if (error.message === "You cannot block yourself") {
    return res.status(400).json({ message: "You cannot block yourself" });
  }
  if (error.code === "P2003") {
    return res.status(404).json({ message: "User not found" });
  }
    if (error.code === "P2002") {
      return res.status(409).json({ message: "User is already blocked" });
    }
    logger.error(error, "settings.blocked.block.failed");
    next(error);
  }
};

// DELETE /api/v1/settings/blocked/:userId
export const unblockUserHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const blockerId = (req as any).user?.id;
    const blockedId  = req.params.userId as string;

    if (!blockerId) {
      logger.warn({ route: req.originalUrl }, "settings.blocked.unblock.unauthorized");
      return res.status(401).json({ message: "Unauthorized" });
    }

    await settingsService.unblockUser(blockerId, blockedId);

    logger.info({ blockerId, blockedId }, "settings.blocked.unblock.success");

    return res.status(200).json({ message: "User unblocked successfully" });
  } catch (error) {
    logger.error(error, "settings.blocked.unblock.failed");
    next(error);
  }
};

// Bug Report
// POST /api/v1/settings/bug-report
export const submitBugReportHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      logger.warn({ route: req.originalUrl }, "settings.bugreport.submit.unauthorized");
      return res.status(401).json({ message: "Unauthorized" });
    }

    await settingsService.submitBugReport(userId, req.body);

    logger.info({ userId }, "settings.bugreport.submit.success");

    return res.status(201).json({ message: "Bug report submitted successfully" });
  } catch (error) {
    logger.error(error, "settings.bugreport.submit.failed");
    next(error);
  }
};