import express from 'express';
import * as labTechnicianController from '../controllers/labTechnicianController.js';

const router = express.Router();

router.get('/', labTechnicianController.getTechnicians);
router.get('/:id', labTechnicianController.getTechnicianById);
router.post('/', labTechnicianController.createTechnician);
router.put('/:id', labTechnicianController.updateTechnician);
router.delete('/:id', labTechnicianController.deleteTechnician);

export default router;