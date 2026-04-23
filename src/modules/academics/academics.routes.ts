import { Router, type Request, type Response } from "express";
import path from "path";
import { unicartRoutes } from "./unicart/routes/unicart.routes";
import { smartPlannerRoutes } from "./smartplanner/routes/smartplanner.routes";

export function academicsRoutes() {
  const router = Router();

  router.get("/unicart", (_req: Request, res: Response) => {
    res.sendFile(path.resolve(__dirname, "unicart/unicart.html"));
  });

  router.get("/smartplanner", (_req: Request, res: Response) => {
    res.sendFile(path.resolve(__dirname, "smartplanner/smartplanner.html"));
  });

  router.get("/smartplanner.dev.js", (_req: Request, res: Response) => {
    res.type("application/javascript");
    res.sendFile(path.resolve(__dirname, "smartplanner/smartplanner.dev.js"));
  });

  router.use("/api/academics", unicartRoutes());
  router.use("/api/academics/smartplanner", smartPlannerRoutes());

  return router;
}