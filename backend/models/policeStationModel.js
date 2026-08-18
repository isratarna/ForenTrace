import pool from '../config/db.js'

const stationSelect = `
  SELECT
    station_id,
    station_name,
    district,
    city,
    address,
    contact_number,
    email,
    created_at
  FROM police_stations
`

export async function findAllStations({ search } = {}) {
  let sql = `${stationSelect} WHERE 1 = 1`
  const params = []

  if (search) {
    sql += `
      AND (
        station_name LIKE ?
        OR district LIKE ?
        OR city LIKE ?
        OR address LIKE ?
        OR contact_number LIKE ?
        OR email LIKE ?
      )
    `
    const term = `%${search}%`
    params.push(term, term, term, term, term, term)
  }

  sql += ' ORDER BY station_id ASC'

  const [rows] = await pool.execute(sql, params)
  return rows
}

export async function findStationById(id) {
  const [rows] = await pool.execute(
    `${stationSelect} WHERE station_id = ? LIMIT 1`,
    [id]
  )

  return rows[0] || null
}

export async function createStation({
  name,
  district,
  city,
  address,
  contact,
  email,
}) {
  const [result] = await pool.execute(
    `
    INSERT INTO police_stations
      (station_name, district, city, address, contact_number, email)
    VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      name.trim(),
      district.trim(),
      city.trim(),
      address.trim(),
      contact.trim(),
      email.trim().toLowerCase(),
    ]
  )

  return findStationById(result.insertId)
}

export async function updateStationById(id, {
  name,
  district,
  city,
  address,
  contact,
  email,
}) {
  await pool.execute(
    `
    UPDATE police_stations
    SET station_name = ?, district = ?, city = ?, address = ?, contact_number = ?, email = ?
    WHERE station_id = ?
    `,
    [
      name.trim(),
      district.trim(),
      city.trim(),
      address.trim(),
      contact.trim(),
      email.trim().toLowerCase(),
      id,
    ]
  )

  return findStationById(id)
}

export async function deleteStationById(id) {
  const [result] = await pool.execute(
    'DELETE FROM police_stations WHERE station_id = ?',
    [id]
  )

  return result.affectedRows
}

export async function stationHasOfficers(id) {
  const [rows] = await pool.execute(
    'SELECT officer_id FROM officers WHERE station_id = ? LIMIT 1',
    [id]
  )

  return rows.length > 0
}
