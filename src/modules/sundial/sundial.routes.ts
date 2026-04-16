import { Router } from "express";
import * as sundialController from "./sundial.controller";
import { validate } from "@/middleware/validateRequest";
import { getSundialByDateRangeSchema } from "./sundial.validation";

const router = Router();

router.get(
  "/queryByDateRange",
  validate(getSundialByDateRangeSchema),
  sundialController.getNewsByDateRangeHandler
);

router.get("/", sundialController.getAllNewsHandler);

export default router;
