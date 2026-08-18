import express from 'express'

import {
  listStations,
  getStation,
  createStation,
  updateStation,
  deleteStation,
} from '../controllers/policeStationController.js'
import { requireAuth } from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'

const router = express.Router()

router.get('/', listStations)
router.get('/:id', getStation)
router.post('/', requireAuth, requireRole('Admin'), createStation)
router.put('/:id', requireAuth, requireRole('Admin'), updateStation)
router.delete('/:id', requireAuth, requireRole('Admin'), deleteStation)

export default router
