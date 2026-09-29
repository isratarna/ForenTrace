import express from 'express'
import { intersectionLabs } from '../controllers/reportController.js'

const router = express.Router()

router.get('/intersection', intersectionLabs)

export default router
