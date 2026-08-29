import * as dnaAnalyticsModel from '../models/dnaAnalyticsModel.js';

// Step 11: Multitable JOIN (Lab + Tech + User)
export const getTechnicianLabOverview = async (req, res) => {
    try {
        const data = await dnaAnalyticsModel.getTechnicianLabOverview();
        return res.status(200).json({ success: true, count: data.length, data });
    } catch (error) {
        console.error('Analytics JOIN Query Error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// Step 12: Aggregate with GROUP BY & HAVING
export const getLabCapacityAnalytics = async (req, res) => {
    try {
        const minTech = req.query.minTech || 0;
        const data = await dnaAnalyticsModel.getLabCapacityAnalytics(minTech);
        return res.status(200).json({ success: true, count: data.length, data });
    } catch (error) {
        console.error('Analytics Group By Query Error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// GET /api/analytics/dna/above-average-labs
export const getAboveAverageCapacityLabs = async (req, res) => {
    try {
        const data = await dnaAnalyticsModel.getAboveAverageCapacityLabs();
        return res.status(200).json({ success: true, count: data.length, data });
    } catch (error) {
        console.error('Analytics Subquery Error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};