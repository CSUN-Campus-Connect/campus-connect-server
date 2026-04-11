// src/modules/security/security.routes.ts
import { Router } from "express";
import { authenticateToken } from "@/middleware/auth.middleware";
import { requirePermission } from "@/middleware/permission.middleware";
import * as securityController from "./security.controller";

const router = Router();

// --- Student-facing: submit a report (any authenticated user) ---
router.post(
  "/reports",
  authenticateToken,
  securityController.submitReport,
);

// --- Anonymous reporting (no auth required) ---
router.post(
  "/reports/anonymous",
  securityController.submitAnonymousReport,
);

// --- Anonymous tracking (no auth required, token-based) ---
router.get(
  "/reports/track/:token",
  securityController.trackAnonymousReport,
);

// --- Student: view own reports ---
router.get(
  "/reports/mine",
  authenticateToken,
  securityController.getMyReports,
);

// --- Student: get report detail (own report only) ---
router.get(
  "/reports/:id",
  authenticateToken,
  securityController.getReportDetail,
);

// --- Student: send message on own report ---
router.post(
  "/reports/:id/messages",
  authenticateToken,
  securityController.sendMessage,
);

// --- Admin: case queue ---
router.get(
  "/cases",
  authenticateToken,
  requirePermission("security:view_cases"),
  securityController.getCaseQueue,
);

// --- Admin: case detail ---
router.get(
  "/cases/:id",
  authenticateToken,
  requirePermission("security:view_cases"),
  securityController.getCaseDetail,
);

// --- Admin: update case status ---
router.patch(
  "/cases/:id/status",
  authenticateToken,
  requirePermission("security:investigate"),
  securityController.updateCaseStatus,
);

// --- Admin: assign case ---
router.patch(
  "/cases/:id/assign",
  authenticateToken,
  requirePermission("security:assign"),
  securityController.assignCase,
);

// --- Admin: send message (handler side) ---
router.post(
  "/cases/:id/messages",
  authenticateToken,
  requirePermission("security:investigate"),
  securityController.sendCaseMessage,
);

// --- Admin: get messages for a case ---
router.get(
  "/cases/:id/messages",
  authenticateToken,
  requirePermission("security:view_cases"),
  securityController.getCaseMessages,
);

// --- Admin: add involved party ---
router.post(
  "/cases/:id/involved-parties",
  authenticateToken,
  requirePermission("security:investigate"),
  securityController.addInvolvedParty,
);

// --- Admin: security stats ---
router.get(
  "/stats",
  authenticateToken,
  requirePermission("security:view_cases"),
  securityController.getSecurityStats,
);

export default router;