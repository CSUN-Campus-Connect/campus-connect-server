import { Router } from "express";
import multer from "multer";
import { authenticateToken } from "@/middleware/auth.middleware";
import { requirePermission } from "@/middleware/permission.middleware";
import * as securityController from "./security.controller";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// Student section
router.post("/reports", authenticateToken, securityController.submitReport);
router.post("/reports/anonymous", securityController.submitAnonymousReport);
router.get("/reports/track/:token", securityController.trackAnonymousReport);
router.get("/reports/mine", authenticateToken, securityController.getMyReports);
router.get("/reports/:id", authenticateToken, securityController.getReportDetail);
router.post("/reports/:id/messages", authenticateToken, securityController.sendMessage);
router.post("/reports/:id/evidence", authenticateToken, upload.single("file"), securityController.uploadReporterEvidence);

// Admin section
router.get("/cases", authenticateToken, requirePermission("security:view_cases"), securityController.getCaseQueue);
router.get("/cases/:id", authenticateToken, requirePermission("security:view_cases"), securityController.getCaseDetail);
router.patch("/cases/:id/status", authenticateToken, requirePermission("security:investigate"), securityController.updateCaseStatus);
router.patch("/cases/:id/assign", authenticateToken, requirePermission("security:assign"), securityController.assignCase);
router.post("/cases/:id/messages", authenticateToken, requirePermission("security:investigate"), securityController.sendCaseMessage);
router.get("/cases/:id/messages", authenticateToken, requirePermission("security:view_cases"), securityController.getCaseMessages);
router.post("/cases/:id/involved-parties", authenticateToken, requirePermission("security:investigate"), securityController.addInvolvedParty);
router.post("/cases/:id/evidence", authenticateToken, requirePermission("security:investigate"), upload.single("file"), securityController.uploadEvidence);
router.get("/stats", authenticateToken, requirePermission("security:view_cases"), securityController.getSecurityStats);

export default router;