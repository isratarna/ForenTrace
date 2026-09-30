import express from 'express'

import {
  createManagedUser,
  changeOwnPassword,
  resetUserPassword,
  listUsers,
  getUser,
  updateUser,
  deleteUser,
  setUserStatus,
} from '../controllers/userController.js'
import { requireAuth } from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'

const router = express.Router()

router.put('/password', requireAuth, changeOwnPassword)

router.use(requireAuth, requireRole('Admin'))

router.get('/', listUsers)
router.post('/create', createManagedUser)
router.put('/:id/password/reset', resetUserPassword)
router.get('/:id', getUser)
router.put('/:id/status', setUserStatus)
router.put('/:id', updateUser)
router.delete('/:id', deleteUser)

export default router
