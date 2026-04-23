import { Router } from "express";
import { listCsunUsuEvents } from "./csunUsu.controller";

const router = Router();

router.get("/csun-usu", listCsunUsuEvents);

export default router;
