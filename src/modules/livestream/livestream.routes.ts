import { Router, raw } from "express";
import * as livestreamController from "./livestream.controller";
import { validate } from "../../middleware/validateRequest";
import { authenticateToken } from "../../middleware/auth.middleware";
import { createLivestreamSchema } from "./livestream.validation";

const router = Router();

// LiveKit webhook - must be before auth middleware
// Needs raw body for signature verification
router.post(
  "/webhook",
  raw({ type: "application/webhook+json" }),
  livestreamController.webhookHandler
);

// All routes below require authentication
router.use(authenticateToken);

// Livestream CRUD
router.get("/", livestreamController.getActiveLivestreamsHandler);
router.post(
  "/",
  validate(createLivestreamSchema),
  livestreamController.startLivestreamHandler
);

// Single livestream operations
router.get("/:id", livestreamController.getLivestreamHandler);
router.post("/:id/join", livestreamController.joinLivestreamHandler);
router.patch("/:id/end", livestreamController.endLivestreamHandler);

export default router;