import { Router } from 'express';
import type { Request, Response } from 'express';
import { sendSuccess, sendError } from '../lib/response.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import { getServiceConfigs, upsertServiceConfigs, getServiceConfigForService } from '../services/config.service.js';
import { VALID_SERVICES, SERVICE_DEFINITIONS } from '../config/service-definitions.js';
import { listAuth0Roles, invalidateAuth0Token } from '../services/auth0.service.js';
import { prisma } from '../lib/prisma.js';
import { refreshS3Client } from '../services/s3.service.js';
import { refreshSESClient } from '../services/email.service.js';

const router = Router();

// GET /api/v1/config/services — IT Admin: view all service configurations
router.get(
  '/services',
  authenticate,
  requireRole('HOUSE_IT_ADMIN'),
  async (_req: Request, res: Response) => {
    try {
      const groups = await getServiceConfigs();
      const definitions = Object.entries(SERVICE_DEFINITIONS).map(([key, def]) => ({
        service: key,
        label: def.label,
        fields: def.configs.map((c) => ({
          key: c.key,
          label: c.label,
          isSecret: c.isSecret,
        })),
      }));
      sendSuccess(res, { groups, definitions });
    } catch (err) {
      console.error('Fetch service configs error:', err);
      sendError(res, 'Failed to fetch service configurations', 'CONFIG_ERROR', 500);
    }
  },
);

// PUT /api/v1/config/services/:service — IT Admin: update service configuration
router.put(
  '/services/:service',
  authenticate,
  requireRole('HOUSE_IT_ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const service = req.params.service as string;

      if (!VALID_SERVICES.includes(service)) {
        sendError(res, `Invalid service: ${service}`, 'INVALID_SERVICE', 400);
        return;
      }

      const { configs } = req.body;
      if (!Array.isArray(configs)) {
        sendError(res, 'configs must be an array', 'VALIDATION_ERROR', 400);
        return;
      }

      await upsertServiceConfigs(service, configs, req.user!.userId);

      // Refresh affected service clients
      if (service === 's3') refreshS3Client();
      if (service === 'ses') refreshSESClient();
      if (service === 'auth0') invalidateAuth0Token();

      const updatedConfigs = await getServiceConfigForService(service);
      sendSuccess(res, { service, configs: updatedConfigs });
    } catch (err) {
      console.error('Update service config error:', err);
      sendError(res, 'Failed to update service configuration', 'CONFIG_ERROR', 500);
    }
  },
);

// GET /api/v1/config/auth0/roles — IT Admin: list Auth0 roles from tenant
router.get(
  '/auth0/roles',
  authenticate,
  requireRole('HOUSE_IT_ADMIN'),
  async (_req: Request, res: Response) => {
    try {
      const roles = await listAuth0Roles();
      sendSuccess(res, { roles });
    } catch (err) {
      console.error('Fetch Auth0 roles error:', err);
      sendError(res, 'Failed to fetch Auth0 roles. Check Auth0 configuration.', 'AUTH0_ERROR', 500);
    }
  },
);

// GET /api/v1/config/auth0/role-mappings — IT Admin: list role mappings
router.get(
  '/auth0/role-mappings',
  authenticate,
  requireRole('HOUSE_IT_ADMIN'),
  async (_req: Request, res: Response) => {
    try {
      const mappings = await prisma.auth0RoleMapping.findMany({
        orderBy: { created_at: 'desc' },
      });
      sendSuccess(res, { mappings });
    } catch (err) {
      sendError(res, 'Failed to fetch role mappings', 'MAPPING_ERROR', 500);
    }
  },
);

// PUT /api/v1/config/auth0/role-mappings — IT Admin: replace all role mappings
router.put(
  '/auth0/role-mappings',
  authenticate,
  requireRole('HOUSE_IT_ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const { mappings } = req.body;
      if (!Array.isArray(mappings)) {
        sendError(res, 'mappings must be an array', 'VALIDATION_ERROR', 400);
        return;
      }

      const validRoles = ['HOUSE_USER', 'HOUSE_LANDLORD', 'HOUSE_ADMIN', 'HOUSE_IT_ADMIN'];
      for (const m of mappings) {
        if (!m.auth0_role_id || !m.auth0_role_name || !m.local_role) {
          sendError(res, 'Each mapping requires auth0_role_id, auth0_role_name, and local_role', 'VALIDATION_ERROR', 400);
          return;
        }
        if (!validRoles.includes(m.local_role)) {
          sendError(res, `Invalid local_role: ${m.local_role}`, 'VALIDATION_ERROR', 400);
          return;
        }
      }

      // Replace all mappings in a transaction
      await prisma.$transaction([
        prisma.auth0RoleMapping.deleteMany(),
        ...mappings.map((m: { auth0_role_id: string; auth0_role_name: string; local_role: string }) =>
          prisma.auth0RoleMapping.create({
            data: {
              auth0_role_id: m.auth0_role_id,
              auth0_role_name: m.auth0_role_name,
              local_role: m.local_role as any,
            },
          }),
        ),
      ]);

      const updated = await prisma.auth0RoleMapping.findMany({
        orderBy: { created_at: 'desc' },
      });
      sendSuccess(res, { mappings: updated });
    } catch (err) {
      console.error('Update role mappings error:', err);
      sendError(res, 'Failed to update role mappings', 'MAPPING_ERROR', 500);
    }
  },
);

export default router;
