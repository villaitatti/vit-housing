import type { Request, Response, NextFunction } from 'express';
import { sendError } from '../lib/response.js';

type Role = 'HOUSE_USER' | 'HOUSE_LANDLORD' | 'HOUSE_ADMIN' | 'HOUSE_IT_ADMIN';

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 'Authentication required', 'UNAUTHORIZED', 401);
      return;
    }

    if (!roles.some(r => req.user!.roles.includes(r))) {
      sendError(res, 'Insufficient permissions', 'FORBIDDEN', 403);
      return;
    }

    next();
  };
}
