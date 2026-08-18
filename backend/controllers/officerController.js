import {
  findAllOfficers,
  findOfficerById,
  createOfficer as dbCreateOfficer,
  updateOfficerById as dbUpdateOfficer,
  deleteOfficerById as dbDeleteOfficer,
  officerHasUsers,
  badgeNumberExists,
  emailExistsInOfficers,
} from '../models/officerModel.js'
import pool from '../config/db.js'

export function formatOfficer(row) {
  if (!row) return null

  return {
    id: row.officer_id,
    name: `${row.first_name} ${row.last_name}`.trim(),
    firstName: row.first_name,
    lastName: row.last_name,
    rank: row.rank,
    badge: row.badge_number,
    stationId: row.station_id,
    station: row.station_name || '',
    phone: row.phone || '',
    email: row.email,
    status: 'Active',
    createdAt: row.created_at,
  }
}

function parseOfficerId(value) {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) return null
  return id
}

export async function listOfficers(req, res) {
  try {
    const search = req.query.search?.trim() || req.query.q?.trim() || ''
    const stationId = req.query.stationId ? Number(req.query.stationId) : null
    const rank = req.query.rank?.trim() || ''

    const officers = await findAllOfficers({
      search,
      stationId: stationId && !isNaN(stationId) ? stationId : undefined,
      rank: rank || undefined,
    })

    return res.status(200).json({
      success: true,
      officers: officers.map(formatOfficer),
    })
  } catch (error) {
    console.error('List officers error:', error)
    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
    })
  }
}

export async function getOfficer(req, res) {
  try {
    const id = parseOfficerId(req.params.id)
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Invalid officer id.',
      })
    }

    const officer = await findOfficerById(id)
    if (!officer) {
      return res.status(404).json({
        success: false,
        message: 'Officer not found.',
      })
    }

    return res.status(200).json({
      success: true,
      officer: formatOfficer(officer),
    })
  } catch (error) {
    console.error('Get officer error:', error)
    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
    })
  }
}

export async function createOfficer(req, res) {
  try {
    let firstName = req.body.firstName?.trim()
    let lastName = req.body.lastName?.trim()
    const fullName = req.body.name?.trim()

    if (fullName && (!firstName && !lastName)) {
      const parts = fullName.split(/\s+/)
      firstName = parts[0] || ''
      lastName = parts.slice(1).join(' ') || ''
    }

    const rank = req.body.rank?.trim()
    const badgeNumber = req.body.badgeNumber?.trim() || req.body.badge?.trim()
    const email = req.body.email?.trim()
    const phone = req.body.phone?.trim() || null
    const stationId = Number(req.body.stationId || req.body.station)

    if (!firstName || !lastName || !rank || !badgeNumber || !email || isNaN(stationId) || stationId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'First name, last name, rank, badge number, email, and valid station ID are required.',
      })
    }

    // Check if station exists
    const [stationRows] = await pool.execute('SELECT station_id FROM police_stations WHERE station_id = ?', [stationId])
    if (stationRows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'The specified police station does not exist.',
      })
    }

    // Check uniqueness
    if (await badgeNumberExists(badgeNumber)) {
      return res.status(409).json({
        success: false,
        message: 'An officer with this badge number already exists.',
      })
    }

    if (await emailExistsInOfficers(email)) {
      return res.status(409).json({
        success: false,
        message: 'An officer with this email already exists.',
      })
    }

    const newOfficer = await dbCreateOfficer({
      stationId,
      firstName,
      lastName,
      rank,
      badgeNumber,
      phone,
      email,
    })

    return res.status(201).json({
      success: true,
      message: 'Officer created successfully.',
      officer: formatOfficer(newOfficer),
    })
  } catch (error) {
    console.error('Create officer error:', error)
    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
    })
  }
}

export async function updateOfficer(req, res) {
  try {
    const id = parseOfficerId(req.params.id)
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Invalid officer id.',
      })
    }

    const existing = await findOfficerById(id)
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Officer not found.',
      })
    }

    let firstName = req.body.firstName?.trim()
    let lastName = req.body.lastName?.trim()
    const fullName = req.body.name?.trim()

    if (fullName && (!firstName && !lastName)) {
      const parts = fullName.split(/\s+/)
      firstName = parts[0] || ''
      lastName = parts.slice(1).join(' ') || ''
    }

    const rank = req.body.rank?.trim()
    const badgeNumber = req.body.badgeNumber?.trim() || req.body.badge?.trim()
    const email = req.body.email?.trim()
    const phone = req.body.phone?.trim() || null
    const stationId = Number(req.body.stationId || req.body.station)

    if (!firstName || !lastName || !rank || !badgeNumber || !email || isNaN(stationId) || stationId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'First name, last name, rank, badge number, email, and valid station ID are required.',
      })
    }

    // Check if station exists
    const [stationRows] = await pool.execute('SELECT station_id FROM police_stations WHERE station_id = ?', [stationId])
    if (stationRows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'The specified police station does not exist.',
      })
    }

    // Check uniqueness
    if (await badgeNumberExists(badgeNumber, id)) {
      return res.status(409).json({
        success: false,
        message: 'An officer with this badge number already exists.',
      })
    }

    if (await emailExistsInOfficers(email, id)) {
      return res.status(409).json({
        success: false,
        message: 'An officer with this email already exists.',
      })
    }

    const updatedOfficer = await dbUpdateOfficer(id, {
      stationId,
      firstName,
      lastName,
      rank,
      badgeNumber,
      phone,
      email,
    })

    return res.status(200).json({
      success: true,
      message: 'Officer updated successfully.',
      officer: formatOfficer(updatedOfficer),
    })
  } catch (error) {
    console.error('Update officer error:', error)
    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
    })
  }
}

export async function deleteOfficer(req, res) {
  try {
    const id = parseOfficerId(req.params.id)
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Invalid officer id.',
      })
    }

    const existing = await findOfficerById(id)
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Officer not found.',
      })
    }

    if (await officerHasUsers(id)) {
      return res.status(409).json({
        success: false,
        message: 'This officer has a linked user account and cannot be deleted.',
      })
    }

    await dbDeleteOfficer(id)

    return res.status(200).json({
      success: true,
      message: 'Officer deleted successfully.',
    })
  } catch (error) {
    console.error('Delete officer error:', error)
    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
    })
  }
}
