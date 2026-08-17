const express = require('express');
const router = express.Router();
const stationController = require('../controllers/policeStationController');

router.get('/', stationController.getStations);
router.get('/:id', stationController.getStationById);
router.post('/', stationController.createStation);
router.put('/:id', stationController.updateStation);
router.delete('/:id', stationController.deleteStation);

module.exports = router;