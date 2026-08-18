import express from 'express'
import {
  login,
  logout,
  register,
  registerOfficer,
  getCurrentUser,
} from '../controllers/authController.js'
import { requireAuth } from '../middleware/authMiddleware.js'
const router = express.Router()

router.post('/login', login)
router.post('/register', register)
router.post('/register/officer', registerOfficer)
router.post('/logout', logout)
router.get('/me', requireAuth, getCurrentUser)
export default router