import { Router } from 'express';
import authRouter from './auth.js';
import usersRouter from './users.js';
import invitationsRouter from './invitations.js';
import listingsRouter from './listings.js';
import favoritesRouter from './favorites.js';
import configRouter from './config.js';
import drupalImportRouter from './drupalImport.js';

const router = Router();

router.use('/auth', authRouter);
router.use('/users', usersRouter);
router.use('/invitations', invitationsRouter);
router.use('/listings', listingsRouter);
router.use('/favorites', favoritesRouter);
router.use('/config', configRouter);
router.use('/admin/drupal-import', drupalImportRouter);

export default router;
