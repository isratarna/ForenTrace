import express from 'express';
import * as labTechnicianController from '../controllers/labTechnicianController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/roleMiddleware.js';

const router = express.Router();

router.get('/', requireAuth, labTechnicianController.getTechnicians);
router.get('/:id', requireAuth, labTechnicianController.getTechnicianById);
router.post('/', requireAuth, requireRole('Admin'), labTechnicianController.createTechnician);
router.put('/:id', requireAuth, requireRole('Admin'), labTechnicianController.updateTechnician);
router.delete('/:id', requireAuth, requireRole('Admin'), labTechnicianController.deleteTechnician);

router.post('/:id/link-user', requireAuth, requireRole('Admin'), labTechnicianController.linkUserAccount);

export default router;