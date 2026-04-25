import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import hpp from "hpp";
import type { Request } from "express";

// ── CORS ─────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  // Local development
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
  // Docker Compose — frontend container calling backend container
  "http://frontend:3000",
  // Add your production domain here when you deploy:
  // "https://your-app.vercel.app",
];

export const corsConfig = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, server-to-server)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    // Allow any localhost / 127.0.0.1 port in development
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    // Allow any extra origins injected via environment (comma-separated)
    // e.g. ALLOWED_ORIGINS=https://your-app.vercel.app,https://staging.example.com
    const envOrigins = (process.env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
    if (envOrigins.includes(origin)) return callback(null, true);

    callback(new Error(`CORS: origin '${origin}' not allowed`));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: true,
  optionsSuccessStatus: 204,
});

// ── Helmet ────────────────────────────────────────────────────────────────────
export const helmetConfig = helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false, // disable CSP for API server
});

// ── Rate limiting ─────────────────────────────────────────────────────────────
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) =>
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown",
});

// Scraper endpoints need a more lenient limit — each call fans out to
// multiple catalog.csun.edu pages and can take 5–15 s.
export const scraperRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

// ── HPP ───────────────────────────────────────────────────────────────────────
export const hppProtection = hpp();
