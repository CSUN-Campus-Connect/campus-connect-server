import { Router } from "express";
import { authenticateToken } from "@/middleware/auth.middleware";
import { requirePermission } from "@/middleware/permission.middleware";
import * as moderationController from "./moderation.controller";

const router = Router();

// --- Student-facing: submit a report (any authenticated user) ---
router.post(
  "/reports",
  authenticateToken,
  moderationController.submitReport,
);

// --- Admin-facing: all routes below require moderation permissions ---

// GET /api/v1/moderation/queue - List reports (filtered, paginated)
router.get(
  "/queue",
  authenticateToken,
  requirePermission("moderation:read"),
  moderationController.getQueue,
);

// GET /api/v1/moderation/reports/:id - Get full report detail with target content
router.get(
  "/reports/:id",
  authenticateToken,
  requirePermission("moderation:read"),
  moderationController.getReportDetail,
);

// PATCH /api/v1/moderation/reports/:id/claim - Claim a report for review
router.patch(
  "/reports/:id/claim",
  authenticateToken,
  requirePermission("moderation:review"),
  moderationController.claimReport,
);

// PATCH /api/v1/moderation/reports/:id/status - Update report status
router.patch(
  "/reports/:id/status",
  authenticateToken,
  requirePermission("moderation:review"),
  moderationController.updateReportStatus,
);

// POST /api/v1/moderation/reports/:id/action - Take action on a report
router.post(
  "/reports/:id/action",
  authenticateToken,
  requirePermission("moderation:action"),
  moderationController.takeAction,
);

// GET /api/v1/moderation/stats - Moderation overview stats
router.get(
  "/stats",
  authenticateToken,
  requirePermission("moderation:read"),
  moderationController.getStats,
);

export default router;