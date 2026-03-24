import { Router } from "express";
import * as eventController from "./event.controller";
import { authenticateToken } from "@/middleware/auth.middleware";
import { validate } from "@/middleware/validateRequest";
import { createEventSchema, updateEventSchema } from "./event.schemas";
import { getEventsByDateRangeSchema, getEventByIdSchema } from "./event.validation";

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

router.get(
  "/:id",
  validate(getEventByIdSchema),
  eventController.getEventByIdHandler
);

router.put(
  "/:id",
  authenticateToken,
  validate(updateEventSchema),
  eventController.updateEventHandler
);

export default router;