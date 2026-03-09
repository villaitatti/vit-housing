import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../lib/jwt.js';
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

  try {
    const payload = verifyToken(token);
    // Backward-compat: handle old JWTs that have `role` instead of `roles`
    if ((payload as any).role && !payload.roles) {
      payload.roles = [(payload as any).role];
    }
    req.user = payload;
    next();
  } catch {
    sendError(res, 'Invalid or expired token', 'UNAUTHORIZED', 401);
  }
}
