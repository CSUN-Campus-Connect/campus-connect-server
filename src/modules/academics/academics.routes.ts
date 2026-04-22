import { Router, type Request, type Response } from "express";
import path from "path";
import { unicartRoutes } from "./unicart/routes/unicart.routes";

export function academicsRoutes() {
  const router = Router();
  router.get("/unicart", (_req: Request, res: Response) => {
    res.sendFile(path.resolve(__dirname, "unicart/unicart.html"));
  });
  router.use("/api/academics", unicartRoutes());
  return router;
}
