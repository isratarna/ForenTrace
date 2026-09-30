import express from 'express'
import { intersectionLabs, labsWithoutTechnicians } from '../controllers/reportController.js'
import { requireAuth } from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'

const router = express.Router()

router.get('/intersection', requireAuth, requireRole('Admin', 'Officer', 'Lab Technician'), intersectionLabs)
router.get('/labs-without-technicians', requireAuth, requireRole('Admin', 'Officer', 'Lab Technician'), labsWithoutTechnicians)

export default router
