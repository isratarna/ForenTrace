import express from 'express'

import {
  listSamples,
  getSample,
  createSample,
  updateSample,
  deleteSample,
} from '../controllers/dnaSampleController.js'
import { requireAuth } from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'

const router = express.Router()

// Admin, Officer, Lab Technician — tinjonei sample dekhte parbe (controller role onujayi data filter kore)
router.get('/', requireAuth, requireRole('Admin', 'Officer', 'Lab Technician'), listSamples)
router.get('/:id', requireAuth, requireRole('Admin', 'Officer', 'Lab Technician'), getSample)

// Shudhu Admin ar Officer sample register/update/delete korte parbe
// (Technician er analysis update Issue 3 e alada route e hobe)
router.post('/', requireAuth, requireRole('Admin', 'Officer'), createSample)
router.put('/:id', requireAuth, requireRole('Admin', 'Officer'), updateSample)
router.delete('/:id', requireAuth, requireRole('Admin', 'Officer'), deleteSample)

export default router
