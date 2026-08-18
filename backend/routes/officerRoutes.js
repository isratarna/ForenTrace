import express from 'express'
import {
  listOfficers,
  getOfficer,
  createOfficer,
  updateOfficer,
  deleteOfficer,
} from '../controllers/officerController.js'
import { requireAuth } from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'

const router = express.Router()

// GET /api/officers and GET /api/officers/:id — accessible to Admin and Officer roles
router.get('/', requireAuth, requireRole('Admin', 'Officer'), listOfficers)
router.get('/:id', requireAuth, requireRole('Admin', 'Officer'), getOfficer)

// POST, PUT, DELETE /api/officers — accessible to Admin only
router.post('/', requireAuth, requireRole('Admin'), createOfficer)
router.put('/:id', requireAuth, requireRole('Admin'), updateOfficer)
router.delete('/:id', requireAuth, requireRole('Admin'), deleteOfficer)

export default router
