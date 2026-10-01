import express from 'express'
import {
  login,
  logout,
  getCurrentUser,
  register,
  getRegisterOptions,
} from '../controllers/authController.js'
import { requireAuth } from '../middleware/authMiddleware.js'
const router = express.Router()

router.post('/login', login)
// Public self-registration — account pending_approval thake, admin approve korle login hobe
router.post('/register', register)
router.get('/register/options', getRegisterOptions)
router.post('/logout', logout)
router.get('/me', requireAuth, getCurrentUser)
export default router