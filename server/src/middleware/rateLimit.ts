import type { Request, Response, NextFunction } from 'express';
import { sendError } from '../lib/response.js';

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  code: string;
  message: string;
  cleanupIntervalMs?: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export function createRateLimitMiddleware(options: RateLimitOptions) {
  const entries = new Map<string, RateLimitEntry>();
  const cleanupIntervalMs = options.cleanupIntervalMs ?? options.windowMs;
  const cleanupStaleEntries = () => {
    const now = Date.now();

    for (const [key, entry] of entries.entries()) {
      if (entry.resetAt <= now) {
        entries.delete(key);
      }
    }
  };
  const cleanupTimer = setInterval(cleanupStaleEntries, cleanupIntervalMs);
  cleanupTimer.unref?.();

  const stopCleanupTimer = () => {
    clearInterval(cleanupTimer);
  };

  process.once('exit', stopCleanupTimer);
  process.once('SIGINT', stopCleanupTimer);
  process.once('SIGTERM', stopCleanupTimer);

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
    const now = Date.now();
    const key = req.ip || 'unknown';
    const current = entries.get(key);

    if (!current || current.resetAt <= now) {
      entries.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    if (current.count >= options.maxRequests) {
      res.setHeader('Retry-After', Math.ceil((current.resetAt - now) / 1000));
      sendError(res, options.message, options.code, 429);
      return;
    }

    current.count += 1;
    next();
  };
}
