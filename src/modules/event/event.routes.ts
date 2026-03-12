import { Router } from "express";
import * as eventController from "./event.controller";
import { authenticateToken } from "@/middleware/auth.middleware";
import { validate } from "@/middleware/validateRequest";
import { createEventSchema } from "./event.schemas";
import { getEventsByDateRangeSchema } from "./event.validation";

const router = Router();

router.post(
  "/",
  authenticateToken,
  validate(createEventSchema),
  eventController.createEventHandler
);

router.get(
  "/",
  validate(getEventsByDateRangeSchema),
  eventController.getEventsByDateRangeHandler
);

export default router;