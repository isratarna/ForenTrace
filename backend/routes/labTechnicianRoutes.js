import express from 'express';
import * as labTechnicianController from '../controllers/labTechnicianController.js';

const router = express.Router();

// Technician CRUD routes
router.get('/', labTechnicianController.getTechnicians);
router.get('/:id', labTechnicianController.getTechnicianById);
router.post('/', labTechnicianController.createTechnician);
router.put('/:id', labTechnicianController.updateTechnician);
router.delete('/:id', labTechnicianController.deleteTechnician);

// Step 8: Link Technician to User Account (1:1 Mapping)
router.post('/:id/link-user', labTechnicianController.linkUserAccount);

export default router;