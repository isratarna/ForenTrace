// urmee

import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { askChatbot } from '../controllers/chatbotController.js';

const router = express.Router();

/**
 * CB-10: Rate limiter for the public chatbot endpoint.
 * Limits each IP address to 20 requests per 10-minute window
 * to protect the application and upstream Gemini API from abuse.
 */
const chatbotRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  limit: 20, // Max 20 requests per IP per window
  max: 20, // Backward compatibility for express-rate-limit v6/v7
  standardHeaders: 'draft-7', // Standard RateLimit headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  statusCode: 429,
  handler: (req, res, _next, options) => {
    return res.status(options.statusCode || 429).json({
      message: 'Too many questions asked from this IP, please try again after a few minutes.'
    });
  }
});

// Public FAQ route (no login needed). Rate limiter and validation protect against abuse.
router.post('/ask', chatbotRateLimiter, askChatbot);

export default router;