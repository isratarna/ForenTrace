import express from 'express';
import * as dnaAnalyticsController from '../controllers/dnaAnalyticsController.js';

const router = express.Router();

// Step 11: Multitable JOIN Query
router.get('/technician-overview', dnaAnalyticsController.getTechnicianLabOverview);

export default router;