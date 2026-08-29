import express from 'express';
import {
    getTechnicianLabOverview,
    getLabCapacityAnalytics
} from '../controllers/dnaAnalyticsController.js';

const router = express.Router();

// Step 11: Multitable JOIN
router.get('/technician-overview', getTechnicianLabOverview);

// Step 12: Aggregate with GROUP BY & HAVING
router.get('/lab-capacity', getLabCapacityAnalytics);

export default router;