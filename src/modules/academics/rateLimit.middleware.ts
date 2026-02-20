import type { Request, Response, NextFunction } from "express";

type Entry = { count: number; resetAt: number };

function cleanup(hits: Map<string, Entry>, now: number) {
  let removed = 0;
  for (const [k, v] of hits) {
    if (now > v.resetAt) {
      hits.delete(k);
      removed += 1;
      if (removed >= 200) break;
    }
  }
}

export function rateLimit(opts: { windowMs: number; max: number }) {
  const hits = new Map<string, Entry>();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip}:${req.baseUrl}:${req.path}`;
    const now = Date.now();
    cleanup(hits, now);

    const entry = hits.get(key);
    if (!entry || now > entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + opts.windowMs });
      return next();
    }

    entry.count += 1;
    if (entry.count > opts.max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({ message: "Rate limit exceeded. Try again shortly." });
    }

    next();
  };
}
