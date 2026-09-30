import express from 'express';
import * as dnaLabController from '../controllers/dnaLabController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/roleMiddleware.js';

const router = express.Router();

router.get('/', requireAuth, dnaLabController.getLabs);
router.get('/:id', requireAuth, dnaLabController.getLabById);

router.post('/', requireAuth, requireRole('Admin'), dnaLabController.createLab);
router.put('/:id', requireAuth, requireRole('Admin'), dnaLabController.updateLab);
router.delete('/:id', requireAuth, requireRole('Admin'), dnaLabController.deleteLab);

export default router;