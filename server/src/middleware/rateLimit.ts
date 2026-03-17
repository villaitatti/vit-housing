import type { Request, Response, NextFunction } from 'express';
import { sendError } from '../lib/response.js';

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  code: string;
  message: string;
  cleanupIntervalMs?: number;
  keyGenerator?: (req: Request) => string;
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

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
    const now = Date.now();
    const key = options.keyGenerator ? options.keyGenerator(req) : (req.ip || 'unknown');
    if (!req.ip && !options.keyGenerator) {
      console.warn('Rate limit middleware received request without req.ip', {
        method: req.method,
        url: req.originalUrl,
        forwardedFor: req.headers['x-forwarded-for'],
      });
    }
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
