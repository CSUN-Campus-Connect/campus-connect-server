/**
 * academics.routes.ts
 */
import { Router, type Request, type Response } from "express";
import path from "path";
import { unicartRoutes } from "./unicart/routes/unicart.routes";

/** Creates routes for the UniCart page and API. */
export function academicsRoutes() {
  const router = Router();

  // Serve the UniCart dev test page
  router.get("/unicart", (_req: Request, res: Response) => {
    res.sendFile(path.resolve(__dirname, "unicart/unicart.html"));
  });

  // Mount all API endpoints under /api/academics
  router.use("/api/academics", unicartRoutes());

  return router;
}
