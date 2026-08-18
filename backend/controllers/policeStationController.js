import {
  findAllStations,
  findStationById,
  createStation as dbCreateStation,
  updateStationById as dbUpdateStation,
  deleteStationById as dbDeleteStation,
  stationHasOfficers,
} from '../models/policeStationModel.js'

export function formatStation(row) {
  if (!row) return null

  return {
    id: row.station_id,
    stationId: row.station_id,
    name: row.station_name,
    stationName: row.station_name,
    district: row.district,
    city: row.city,
    address: row.address,
    contact: row.contact_number,
    contactNumber: row.contact_number,
    email: row.email,
    status: 'Active',
    createdAt: row.created_at,
  }
}

function parseStationId(value) {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) return null
  return id
}

function stationPayload(body) {
  const name = body.name?.trim() || body.stationName?.trim() || body.station_name?.trim()
  const district = body.district?.trim()
  const city = body.city?.trim()
  const address = body.address?.trim()
  const contact = body.contact?.trim() || body.contactNumber?.trim() || body.contact_number?.trim()
  const email = body.email?.trim()

  return {
    name,
    district,
    city,
    address,
    contact,
    email,
  }
}

function validatePayload(payload) {
  return payload.name &&
    payload.district &&
    payload.city &&
    payload.address &&
    payload.contact &&
    payload.email
}

export async function listStations(req, res) {
  try {
    const search = req.query.search?.trim() || req.query.q?.trim() || ''
    const stations = await findAllStations({ search: search || undefined })

    return res.status(200).json({
      success: true,
      stations: stations.map(formatStation),
    })
  } catch (error) {
    console.error('List police stations error:', error)
    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
    })
  }
}

export async function getStation(req, res) {
  try {
    const id = parseStationId(req.params.id)
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Invalid police station id.',
      })
    }

    const station = await findStationById(id)
    if (!station) {
      return res.status(404).json({
        success: false,
        message: 'Police station not found.',
      })
    }

    return res.status(200).json({
      success: true,
      station: formatStation(station),
    })
  } catch (error) {
    console.error('Get police station error:', error)
    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
    })
  }
}

export async function createStation(req, res) {
  try {
    const payload = stationPayload(req.body)

    if (!validatePayload(payload)) {
      return res.status(400).json({
        success: false,
        message: 'Station name, district, city, address, contact, and email are required.',
      })
    }

    const station = await dbCreateStation(payload)

    return res.status(201).json({
      success: true,
      message: 'Police station created successfully.',
      station: formatStation(station),
    })
  } catch (error) {
    console.error('Create police station error:', error)
    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
    })
  }
}

export async function updateStation(req, res) {
  try {
    const id = parseStationId(req.params.id)
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Invalid police station id.',
      })
    }

    const existing = await findStationById(id)
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Police station not found.',
      })
    }

    const payload = stationPayload(req.body)
    if (!validatePayload(payload)) {
      return res.status(400).json({
        success: false,
        message: 'Station name, district, city, address, contact, and email are required.',
      })
    }

    const station = await dbUpdateStation(id, payload)

    return res.status(200).json({
      success: true,
      message: 'Police station updated successfully.',
      station: formatStation(station),
    })
  } catch (error) {
    console.error('Update police station error:', error)
    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
    })
  }
}

export async function deleteStation(req, res) {
  try {
    const id = parseStationId(req.params.id)
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Invalid police station id.',
      })
    }

    const existing = await findStationById(id)
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Police station not found.',
      })
    }

    if (await stationHasOfficers(id)) {
      return res.status(409).json({
        success: false,
        message: 'This police station has assigned officers and cannot be deleted.',
      })
    }

    await dbDeleteStation(id)

    return res.status(200).json({
      success: true,
      message: 'Police station deleted successfully.',
    })
  } catch (error) {
    console.error('Delete police station error:', error)
    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
    })
  }
}
