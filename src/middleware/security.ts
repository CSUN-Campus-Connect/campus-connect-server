import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import hpp from "hpp";

export const helmetConfig = helmet();

const SERVER_PORT = process.env.PORT || 8000;

export const corsConfig = cors({
  origin: (origin, callback) => {
    const allowedOrigins = [
      "http://localhost:3000",
      "https://csun.online",
      "https://www.csun.online",
      `http://localhost:${SERVER_PORT}`,
    ];

    // Allow no origin, allowed origins, or Vercel previews
    if (
      !origin ||
      allowedOrigins.includes(origin) ||
      (origin && origin.includes(".vercel.app"))
    ) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

// Rate limiter for regular use
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: "Too many requests from this IP, try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for login attempts
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many login attempts, try again in 15 minutes.",
  standardHeaders: true,
  legacyHeaders: false,
});

export const hppProtection = hpp();
