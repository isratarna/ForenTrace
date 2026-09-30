import express from 'express';
import {
    getTechnicianLabOverview,
    getLabCapacityAnalytics,
    getAboveAverageCapacityLabs
} from '../controllers/dnaAnalyticsController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/roleMiddleware.js';

const router = express.Router();

// Step 11: Multitable JOIN
router.get('/technician-overview', requireAuth, requireRole('Admin', 'Lab Technician'), getTechnicianLabOverview);

// Step 12: Aggregate with GROUP BY & HAVING
router.get('/lab-capacity', requireAuth, requireRole('Admin', 'Lab Technician'), getLabCapacityAnalytics);

// Step 13: Nested Subquery
router.get('/above-average-labs', requireAuth, requireRole('Admin', 'Lab Technician'), getAboveAverageCapacityLabs);

export default router;