import express from "express";
import userRoutes from "./modules/auth/auth.routes";
import eventRoutes from "./modules/event/event.routes";
import marketplaceRoutes from "./modules/marketplace/marketplace.routes";
import { errorHandler } from "./middleware/errorHandler";
import { academicsRoutes } from "./modules/academics/academics.routes";
import logger from "./utils/logger";
import postsRoutes from "./modules/posts/posts.routes";
import livestreamRoutes from "./modules/livestream/livestream.routes";
import { uploadRoutes } from "./modules/upload/upload.routes";
import { setupSwaggerDocs } from "./swagger";
import messagingRoutes from "./modules/messaging/messaging.routes";
import { setupSocket } from "./socket";
import { createServer } from "http";

import {
  helmetConfig, 
  corsConfig,
  apiRateLimiter,
  hppProtection,
} from "./middleware/security";

const app = express();
const httpServer = createServer(app);

logger.info("Initializing CampusConnect API Server");

app.set('trust proxy', 1);
const PORT = process.env.PORT || 8000;

logger.info("Applying security middleware: Helmet, CORS, Rate Limiting, HPP");
app.use(corsConfig);
app.use(helmetConfig);
app.use(express.json());
app.use(express.urlencoded({ extended: true}));
app.use(hppProtection); 
app.use("/", academicsRoutes());

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
   if (req.path === "/health" || (req.path === "/" && res.statusCode === 200)) return;

   const duration = Date.now() - start;
   const logData = {method: req.method, path: req.path, status: res.statusCode, duration: `${duration}ms`};
  
   if (res.statusCode >= 500) {
      logger.error(logData);}
      else if (res.statusCode >= 400) {
      logger.warn(logData);}
      else {logger.info(logData);}
});
  next();
});

app.get("/", apiRateLimiter, (_req, res) => {
  res.json({
    message: "Welcome to CampusConnect endpoints!",
  });
});

// API Routes
app.use("/api/v1/users", userRoutes);
logger.info("Mounted auth routes at /api/v1/users");
app.use("/api/v1/events", eventRoutes);
logger.info("Mounted event routes at /api/v1/events");
app.use("/api/v1/marketplace", marketplaceRoutes);
logger.info("Mounted marketplace routes at /api/v1/marketplace");
app.use("/api/v1/livestreams", livestreamRoutes);
logger.info("Mounted livestream routes at /api/v1/livestreams");
app.use("/api/v1/posts", postsRoutes);
logger.info("Mounted posts routes at /api/v1/posts");
app.use("/api/v1/messages", messagingRoutes);
logger.info("Mounted messaging routes at /api/v1/messages");
app.use("/api/v1/upload", uploadRoutes);
logger.info("Mounted upload routes at /api/v1/upload");

const io = setupSocket(httpServer);
logger.info("Socket.io initialized");

// Setup Swagger UI
setupSwaggerDocs(app);
logger.info("Mounted Swagger UI at /api/docs");

// Register global error handler (needs to be last)
app.use(errorHandler);
logger.info("Registered global error handler");

// Export app for testing
export default app;

if (process.env.NODE_ENV !== 'test') {
  httpServer.listen(PORT, () => {
    logger.info(`API Server is running on http://localhost:${PORT}`);
    logger.info(`API Docs available at http://localhost:${PORT}/api/docs`);
    logger.info(`Sec Middleware: Helmet, CORS, Rate Limiting, HPP`);
    logger.info(`Socket.io listening on ws://localhost:${PORT}`);
  });
}