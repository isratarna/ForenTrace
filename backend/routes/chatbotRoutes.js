// urmee

import express from 'express';
import { askChatbot } from '../controllers/chatbotController.js';

const router = express.Router();

// Public FAQ route (no login needed). Member 3 will add rate limit + validation here.
router.post('/ask', askChatbot);

export default router;