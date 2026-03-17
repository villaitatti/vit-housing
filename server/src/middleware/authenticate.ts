import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';
import { sendError } from '../lib/response.js';
import type { JwtPayload } from '@vithousing/shared';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.token;

  if (!token) {
    sendError(res, 'Authentication required', 'UNAUTHORIZED', 401);
    return;
  }

  let payload: JwtPayload;
  try {
    payload = verifyToken(token);
    // Backward-compat: handle old JWTs that have `role` instead of `roles`
    if ((payload as any).role && !payload.roles) {
      payload.roles = [(payload as any).role];
    }
  } catch {
    sendError(res, 'Invalid or expired token', 'UNAUTHORIZED', 401);
    return;
  }

  // If the JWT carries a token_version, verify it hasn't been revoked
  if (payload.token_version !== undefined) {
    prisma.user.findUnique({
      where: { id: payload.userId },
      select: { token_version: true },
    }).then((user) => {
      if (user && user.token_version > payload.token_version!) {
        sendError(res, 'Session has been revoked', 'UNAUTHORIZED', 401);
        return;
      }
      req.user = payload;
      next();
    }).catch(() => {
      // DB lookup failed — allow request to proceed rather than block
      req.user = payload;
      next();
    });
  } else {
    // Legacy tokens without token_version — allow through
    req.user = payload;
    next();
  }
}
