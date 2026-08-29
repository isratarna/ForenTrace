import express from 'express';
import {
    getTechnicianLabOverview,
    getLabCapacityAnalytics,
    getAboveAverageCapacityLabs
} from '../controllers/dnaAnalyticsController.js';

const router = express.Router();

// Step 11: Multitable JOIN
router.get('/technician-overview', getTechnicianLabOverview);

// Step 12: Aggregate with GROUP BY & HAVING
router.get('/lab-capacity', getLabCapacityAnalytics);

// Step 13: Nested Subquery
router.get('/above-average-labs', getAboveAverageCapacityLabs);

export default router;