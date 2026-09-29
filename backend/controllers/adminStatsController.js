import { findAdminCounts } from '../models/adminStatsModel.js'

export async function getAdminCounts(req, res) {
  try {
    const counts = await findAdminCounts()
    return res.status(200).json({ success: true, ...counts })
  } catch (error) {
    console.error('Get admin counts error:', error)
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}

export default { getAdminCounts }
