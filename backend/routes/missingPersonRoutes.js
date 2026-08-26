import express from 'express'
import {
  listMissingPersons,
  getMissingPerson,
  createMissingPerson,
  updateMissingPerson,
  deleteMissingPerson,
  getMissingPersonStatistics,
  getAboveAverageCityMissingPersons,
} from '../controllers/missingPersonController.js'
import { requireAuth } from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'

const router = express.Router()

router.get('/', requireAuth, requireRole('Admin', 'Officer'), listMissingPersons)
router.get('/statistics', requireAuth, requireRole('Admin', 'Officer'), getMissingPersonStatistics)
router.get('/statistics/above-average-cities', requireAuth, requireRole('Admin', 'Officer'), getAboveAverageCityMissingPersons)
router.get('/:id', requireAuth, requireRole('Admin', 'Officer'), getMissingPerson)
router.post('/', requireAuth, requireRole('Officer'), createMissingPerson)
router.put('/:id', requireAuth, requireRole('Officer'), updateMissingPerson)
router.delete('/:id', requireAuth, requireRole('Officer'), deleteMissingPerson)

export default router
