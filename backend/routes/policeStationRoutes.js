const express = require('express');
const router = express.Router();
const stationController = require('../controllers/policeStationController');
const { verifyToken } = require('../middleware/authMiddleware');
const { requireAdmin } = require('../middleware/roleMiddleware'); // Apnar middleware folder theke import kora holo

// Public routes (Sobar jonno open)
router.get('/', stationController.getStations);
router.get('/:id', stationController.getStationById);

// Protected routes (Shudhu Admin-ra create, update, ebong delete korte parbe)
router.post('/', verifyToken, requireAdmin, stationController.createStation);
router.put('/:id', verifyToken, requireAdmin, stationController.updateStation);
router.delete('/:id', verifyToken, requireAdmin, stationController.deleteStation);

module.exports = router;