import { Router, Request, Response, NextFunction } from "express";
import { authenticateToken } from "@/middleware/auth.middleware";
import { isCriticalSendAuthorized } from "./announcement.types";
import * as controller from "./announcement.controller";

const router = Router();

// Require caller to be on the critical-send whitelist
const requireCriticalWhitelist = (req: Request, res: Response, next: NextFunction) => {
  const email = req.user?.email;
  if (!email || !isCriticalSendAuthorized(email)) {
    res.status(403).json({
      error: "unauthorized",
      message: "Not authorized for critical-send operations",
    });
    return;
  }
  next();
};

// Public endpoint — anyone can see the active critical alert, even without auth.
// Emergency visibility matters more than gating this one endpoint.
router.get("/active", controller.getActive);

// Everything below here requires auth
router.use(authenticateToken);

// Dismissal needs a logged-in user (stored per userId)
router.post("/:id/dismiss", controller.dismiss);

// Admin portal list + detail
router.get("/", controller.list);
router.get("/:id", controller.detail);
router.get("/:id/timeline", controller.timeline);
router.get("/:id/stats", controller.stats);

// Critical-send operations (whitelist only)
router.post("/critical", requireCriticalWhitelist, controller.createCritical);
router.post("/:id/transition", requireCriticalWhitelist, controller.transition);
router.post("/:id/end", requireCriticalWhitelist, controller.end);

export default router;