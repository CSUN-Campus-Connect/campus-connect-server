import { Router } from "express";
import * as eventController from "./event.controller";
import { authenticateToken } from "@/middleware/auth.middleware";
import { validate } from "@/middleware/validateRequest";
import { createEventSchema } from "./event.schemas";

const router = Router();

router.post(
  "/",
  authenticateToken,
  validate(createEventSchema),
  eventController.createEventHandler
);

export default router;