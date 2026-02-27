// Defines HTTP endpoints for clubs. Handlers are stubs for backend to implement.

import { Router } from "express";
import * as clubsController from "./clubs.controller";

const router = Router();

router.get("/", clubsController.listClubsHandler);

router.post("/recommend", clubsController.recommendClubHandler);

router.get("/:slug", clubsController.getClubBySlugHandler);

export default router;
