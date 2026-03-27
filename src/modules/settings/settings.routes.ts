import { Router } from "express";
import * as settingsController from "./settings.controller";
import { validate } from "../../middleware/validateRequest";
import { authenticateToken } from "../../middleware/auth.middleware";
import {
  updateNotificationPreferencesSchema,
  updateAppearancePreferencesSchema,
  updatePrivacyPreferencesSchema,
  submitBugReportSchema,
} from "./settings.validation";

const router = Router();

router.use(authenticateToken);

//  Notification Preferences 
router.get("/notifications", settingsController.getNotificationPreferencesHandler);
router.patch(
  "/notifications",
  validate(updateNotificationPreferencesSchema),
  settingsController.updateNotificationPreferencesHandler
);

//  Appearance Preferences 
router.get("/appearance", settingsController.getAppearancePreferencesHandler);
router.patch(
  "/appearance",
  validate(updateAppearancePreferencesSchema),
  settingsController.updateAppearancePreferencesHandler
);

// Privacy Preferences
router.get("/privacy", settingsController.getPrivacyPreferencesHandler);
router.patch(
  "/privacy",
  validate(updatePrivacyPreferencesSchema),
  settingsController.updatePrivacyPreferencesHandler
);

router.get("/blocked", settingsController.getBlockedUsersHandler);
router.post("/blocked/:userId", settingsController.blockUserHandler);
router.delete("/blocked/:userId", settingsController.unblockUserHandler);

// Bug Report
router.post(
  "/bug-report",
  validate(submitBugReportSchema),
  settingsController.submitBugReportHandler
);

export default router;
