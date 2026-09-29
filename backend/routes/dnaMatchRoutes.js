import express from 'express'

import {
  listMatches,
  getMatch,
  compareSamples,
  createMatch,
  reviewMatch,
  deleteMatch,
} from '../controllers/dnaMatchController.js'
import { requireAuth } from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'

const router = express.Router()

// Tinjonei match dekhte parbe (controller role onujayi filter kore)
router.get('/', requireAuth, requireRole('Admin', 'Officer', 'Lab Technician'), listMatches)
router.get('/:id', requireAuth, requireRole('Admin', 'Officer', 'Lab Technician'), getMatch)

// Technician/officer/admin duita sample select kore comparison run korte parbe
router.post('/compare', requireAuth, requireRole('Admin', 'Officer', 'Lab Technician'), compareSamples)
router.post('/', requireAuth, requireRole('Admin', 'Officer', 'Lab Technician'), createMatch)

// Match confirm/reject — investigation er decision, tai shudhu Admin + Officer
router.put('/:id/status', requireAuth, requireRole('Admin', 'Officer'), reviewMatch)

// Vul match record delete — shudhu Admin
router.delete('/:id', requireAuth, requireRole('Admin'), deleteMatch)

export default router
