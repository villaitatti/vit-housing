import path from 'path';
import multer from 'multer';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import { sendError, sendSuccess } from '../lib/response.js';
import {
  getDrupalImportAuditContent,
  getDrupalImportIncomingDir,
  getDrupalImportLogContent,
  getDrupalImportStatus,
  initializeDrupalImportUploadSession,
  runDrupalImportPreflight,
  saveDrupalImportUpload,
  startDrupalImportRun,
} from '../services/drupalImport.service.js';

const router = Router();

const incomingDir = path.resolve('server/.runtime/drupal-import/incoming');

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      getDrupalImportIncomingDir()
        .then((dir) => callback(null, dir))
        .catch((error) => callback(error as Error, incomingDir));
    },
    filename: (_req, file, callback) => {
      callback(null, `${Date.now()}-${file.originalname}`);
    },
  }),
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024,
  },
});

router.use(authenticate, requireRole('HOUSE_IT_ADMIN'));

router.post('/uploads', async (_req: Request, res: Response) => {
  try {
    const status = await initializeDrupalImportUploadSession();
    sendSuccess(res, { status });
  } catch (error) {
    sendError(res, error instanceof Error ? error.message : 'Failed to initialize upload session', 'DRUPAL_IMPORT_ERROR', 400);
  }
});

router.post('/uploads/sql', upload.single('database_dump'), async (req: Request, res: Response) => {
  if (!req.file) {
    sendError(res, 'Upload a Drupal database dump file.', 'VALIDATION_ERROR', 400);
    return;
  }

  try {
    const status = await saveDrupalImportUpload('database_dump', req.file);
    sendSuccess(res, { status });
  } catch (error) {
    sendError(res, error instanceof Error ? error.message : 'Failed to save database dump', 'DRUPAL_IMPORT_ERROR', 400);
  }
});

router.post('/uploads/files', upload.single('files_archive'), async (req: Request, res: Response) => {
  if (!req.file) {
    sendError(res, 'Upload a Drupal files archive.', 'VALIDATION_ERROR', 400);
    return;
  }

  try {
    const status = await saveDrupalImportUpload('files_archive', req.file);
    sendSuccess(res, { status });
  } catch (error) {
    sendError(res, error instanceof Error ? error.message : 'Failed to save files archive', 'DRUPAL_IMPORT_ERROR', 400);
  }
});

router.post('/preflight', async (_req: Request, res: Response) => {
  try {
    const status = await runDrupalImportPreflight();
    sendSuccess(res, { status });
  } catch (error) {
    sendError(res, error instanceof Error ? error.message : 'Preflight failed', 'DRUPAL_IMPORT_ERROR', 400);
  }
});

router.post('/start', async (_req: Request, res: Response) => {
  try {
    const status = await startDrupalImportRun();
    sendSuccess(res, { status });
  } catch (error) {
    sendError(res, error instanceof Error ? error.message : 'Failed to start import', 'DRUPAL_IMPORT_ERROR', 400);
  }
});

router.get('/status', async (_req: Request, res: Response) => {
  try {
    const status = await getDrupalImportStatus();
    sendSuccess(res, { status });
  } catch (error) {
    sendError(res, error instanceof Error ? error.message : 'Failed to load import status', 'DRUPAL_IMPORT_ERROR', 500);
  }
});

router.get('/log', async (_req: Request, res: Response) => {
  try {
    const content = await getDrupalImportLogContent();
    res.type('text/plain').send(content);
  } catch (error) {
    sendError(res, error instanceof Error ? error.message : 'Failed to load import log', 'DRUPAL_IMPORT_ERROR', 500);
  }
});

router.get('/audit', async (_req: Request, res: Response) => {
  try {
    const audit = await getDrupalImportAuditContent();
    if (!audit) {
      sendError(res, 'No audit report is available yet.', 'NOT_FOUND', 404);
      return;
    }

    res.json(audit);
  } catch (error) {
    sendError(res, error instanceof Error ? error.message : 'Failed to load import audit', 'DRUPAL_IMPORT_ERROR', 500);
  }
});

export default router;
