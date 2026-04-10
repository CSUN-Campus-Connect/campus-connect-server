import { Router } from "express";
import { smartPlannerRoutes } from "./smartplanner/routes/smartplanner.routes";
import { unicartRoutes } from "./unicart/routes/unicart.routes";

export function academicsRoutes() {
  const r = Router();
  r.use("/", smartPlannerRoutes());
  r.use("/", unicartRoutes());
  return r;
}
