import express from 'express'
import {
  login,
  logout,
  getCurrentUser,
} from '../controllers/authController.js'
import { requireAuth } from '../middleware/authMiddleware.js'
const router = express.Router()

router.post('/login', login)
router.post('/logout', logout)
router.get('/me', requireAuth, getCurrentUser)
export default router