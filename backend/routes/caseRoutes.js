import express from 'express'

import {
  listCases,
  getCaseStatistics,
  getAboveAverageOfficers,
  getCase,
  createCase,
  updateCase,
  deleteCase,
} from '../controllers/caseController.js'
import { requireAuth } from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'

const router = express.Router()

// Admins and officers can view case files and their statistics.
router.get('/', requireAuth, requireRole('Admin', 'Officer'), listCases)
router.get('/statistics', requireAuth, requireRole('Admin', 'Officer'), getCaseStatistics)
router.get('/statistics/above-average-officers', requireAuth, requireRole('Admin', 'Officer'), getAboveAverageOfficers)
router.get('/:id', requireAuth, requireRole('Admin', 'Officer'), getCase)

// Only officers can create, update, or delete case files.
router.post('/', requireAuth, requireRole('Officer'), createCase)
router.put('/:id', requireAuth, requireRole('Officer'), updateCase)
router.delete('/:id', requireAuth, requireRole('Officer'), deleteCase)

export default router
