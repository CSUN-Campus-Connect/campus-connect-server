import express from "express";
import userRoutes from "./modules/auth/auth.routes";
import eventRoutes from "./modules/event/event.routes";
import marketplaceRoutes from "./modules/marketplace/marketplace.routes";
import chatRoutes from "./modules/chat/chat.routes";
import clubsRoutes from "./modules/clubs/clubs.routes";
import academicsRoutes from "./modules/academics/academics.routes";
import { loadRetrievalIndex } from "./modules/chat/retrieval";
import { errorHandler } from "./middleware/errorHandler";
import logger from "./utils/logger";

import {
  helmetConfig, 
  corsConfig,
  apiRateLimiter,
  hppProtection,
} from "./middleware/security";

const app = express();
logger.info("Initializing CampusConnect API Server");


app.set('trust proxy', 1);
const PORT = process.env.PORT || 8000;

logger.info("Applying security middleware: Helmet, CORS, Rate Limiting, HPP");
app.use(corsConfig);
app.use(helmetConfig);
app.use(express.json());
app.use(express.urlencoded({ extended: true}));
app.use(hppProtection); 

// Logs all incoming requests with method and URL for debugging and monitoring
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
  // Skip logging for health check endpoint and polling requests to reduce noise in logs
   if (req.path === "/health" || (req.path === "/" && res.statusCode === 200)) return;

   const duration = Date.now() - start;
   const logData = {method: req.method, path: req.path, status: res.statusCode, duration: `${duration}ms`};
  
   // Log errors with error level, warnings with warn level, and successful requests with info level
   if (res.statusCode >= 500) {
      logger.error(logData);}

      else if (res.statusCode >= 400) {
      logger.warn(logData);}

      else {logger.info(logData);}
});
  next();
});

// Home route
app.get("/", apiRateLimiter, (_req, res) => {
  res.json({
    message: "Welcome to CampusConnect endpoints!",
  });
});

// Load chat retrieval index (no DB)
const chatIndexLoaded = loadRetrievalIndex();
logger.info(chatIndexLoaded ? "Chat retrieval index loaded from data/knowledge.csv" : "Chat retrieval index not found; run npm run build:knowledge");

// API Routes
app.use("/api/v1/users", userRoutes);
logger.info("Mounted auth routes at /api/v1/users");
app.use("/api/v1/events", eventRoutes);
logger.info("Mounted event routes at /api/v1/events");
app.use("/api/v1/marketplace", marketplaceRoutes);
logger.info("Mounted marketplace routes at /api/v1/marketplace");
app.use("/api/v1/clubs", clubsRoutes);
logger.info("Mounted clubs routes at /api/v1/clubs");
app.use("/api/v1/academics", academicsRoutes);
logger.info("Mounted academics routes at /api/v1/academics");
app.use("/api/chat", chatRoutes);
logger.info("Mounted chat routes at /api/chat");

// Register global error handler (needs to be last)
app.use(errorHandler);
logger.info("Registered global error handler");

// Export app for testing
export default app;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, async () => {
      logger.info(`API Server is running on http://localhost:${PORT}`);
      logger.info(`Sec Middleware: Helmet, CORS, Rate Limiting, HPP`);
  });
}