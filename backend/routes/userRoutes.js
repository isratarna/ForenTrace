import express from 'express'

import {
  listUsers,
  getUser,
  updateUser,
  deleteUser,
  setUserStatus,
} from '../controllers/userController.js'
import { requireAuth } from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'

const router = express.Router()

router.use(requireAuth, requireRole('Admin'))

router.get('/', listUsers)
router.get('/:id', getUser)
router.put('/:id/status', setUserStatus)
router.put('/:id', updateUser)
router.delete('/:id', deleteUser)

export default router
