import express from 'express';
import {
    listStations,
    getStation,
    createStation,
    updateStation,
    deleteStation
} from '../controllers/policeStationController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/roleMiddleware.js'; // Apnar middleware folder theke import kora holo

const router = express.Router();
//Express library ar router instance load kora hoyeche jate HTTP routes toiri kora jay.

// Public routes (Sobar jonno open)
router.get('/', listStations);
router.get('/:id', getStation);

// Protected routes (Shudhu Admin-ra create, update, ebong delete korte parbe)
router.post('/', requireAuth, requireRole('Admin'), createStation);
router.put('/:id', requireAuth, requireRole('Admin'), updateStation);
router.delete('/:id', requireAuth, requireRole('Admin'), deleteStation);

export default router;