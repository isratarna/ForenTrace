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