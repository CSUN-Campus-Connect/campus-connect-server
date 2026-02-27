// Defines HTTP endpoints for academics / degree planner. Handlers are stubs

import { Router } from "express";
import * as academicsController from "./academics.controller";

const router = Router();


router.get("/planner", academicsController.getPlannerHandler);

router.put("/planner", academicsController.savePlannerHandler);

router.get("/majors", academicsController.listMajorsHandler);

export default router;
