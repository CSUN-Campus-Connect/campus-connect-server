import { Router } from "express";
import * as sundialController from "./sundial.controller";
import { validate } from "@/middleware/validateRequest";
import { getAllSundialSchema, getSundialByDateRangeSchema } from "./sundial.validation";

const router = Router();

router.get(
  "/queryByDateRange",
  validate(getSundialByDateRangeSchema),
  sundialController.getNewsByDateRangeHandler
);

router.get("/", validate(getAllSundialSchema), sundialController.getAllNewsHandler);

export default router;
