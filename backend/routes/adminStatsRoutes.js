import express from 'express'
import { getAdminCounts } from '../controllers/adminStatsController.js'
import { requireAuth } from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'

const router = express.Router()

// Only Admins may access these aggregated counts
router.get('/', requireAuth, requireRole('Admin'), getAdminCounts)

export default router
