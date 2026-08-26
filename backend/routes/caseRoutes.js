import express from 'express'

import {
  listCases,
  getCaseStatistics,
  getCase,
  createCase,
  updateCase,
  deleteCase,
} from '../controllers/caseController.js'
import { requireAuth } from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'

const router = express.Router()

router.get('/', requireAuth, requireRole('Admin', 'Officer'), listCases)
router.get('/statistics', requireAuth, requireRole('Admin', 'Officer'), getCaseStatistics)
router.get('/:id', requireAuth, requireRole('Admin', 'Officer'), getCase)
router.post('/', requireAuth, requireRole('Officer'), createCase)
router.put('/:id', requireAuth, requireRole('Officer'), updateCase)
router.delete('/:id', requireAuth, requireRole('Officer'), deleteCase)

export default router
