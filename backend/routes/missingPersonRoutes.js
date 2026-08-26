import express from 'express'
import {
  listMissingPersons,
  getMissingPerson,
  createMissingPerson,
  updateMissingPerson,
  deleteMissingPerson,
} from '../controllers/missingPersonController.js'
import { requireAuth } from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'

const router = express.Router()

router.get('/', requireAuth, requireRole('Admin', 'Officer'), listMissingPersons)
router.get('/:id', requireAuth, requireRole('Admin', 'Officer'), getMissingPerson)
router.post('/', requireAuth, requireRole('Admin', 'Officer'), createMissingPerson)
router.put('/:id', requireAuth, requireRole('Admin', 'Officer'), updateMissingPerson)
router.delete('/:id', requireAuth, requireRole('Admin', 'Officer'), deleteMissingPerson)

export default router
