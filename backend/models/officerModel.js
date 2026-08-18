import pool from '../config/db.js'

export async function findAllOfficers({ search, stationId, rank } = {}) {
  let sql = `
    SELECT 
      o.officer_id,
      o.station_id,
      o.first_name,
      o.last_name,
      o.rank,
      o.badge_number,
      o.phone,
      o.email,
      o.created_at,
      ps.station_name
    FROM officers o
    JOIN police_stations ps ON o.station_id = ps.station_id
    WHERE 1 = 1
  `
  const params = []

  if (stationId) {
    sql += ' AND o.station_id = ?'
    params.push(stationId)
  }

  if (rank) {
    sql += ' AND o.rank = ?'
    params.push(rank)
  }

  if (search) {
    sql += ' AND (o.first_name LIKE ? OR o.last_name LIKE ? OR o.badge_number LIKE ? OR o.email LIKE ? OR ps.station_name LIKE ?)'
    const term = `%${search}%`
    params.push(term, term, term, term, term)
  }

  sql += ' ORDER BY o.officer_id ASC'

  const [rows] = await pool.execute(sql, params)
  return rows
}

export async function findOfficerById(id) {
  const [rows] = await pool.execute(
    `
    SELECT 
      o.officer_id,
      o.station_id,
      o.first_name,
      o.last_name,
      o.rank,
      o.badge_number,
      o.phone,
      o.email,
      o.created_at,
      ps.station_name
    FROM officers o
    JOIN police_stations ps ON o.station_id = ps.station_id
    WHERE o.officer_id = ?
    LIMIT 1
    `,
    [id]
  )
  return rows[0] || null
}

export async function createOfficer({
  stationId,
  firstName,
  lastName,
  rank,
  badgeNumber,
  phone = null,
  email,
}) {
  const [result] = await pool.execute(
    `
    INSERT INTO officers
      (station_id, first_name, last_name, \`rank\`, badge_number, phone, email)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      stationId,
      firstName.trim(),
      lastName.trim(),
      rank.trim(),
      badgeNumber.trim(),
      phone ? phone.trim() : null,
      email.trim().toLowerCase(),
    ]
  )

  return findOfficerById(result.insertId)
}

export async function updateOfficerById(id, {
  stationId,
  firstName,
  lastName,
  rank,
  badgeNumber,
  phone = null,
  email,
}) {
  await pool.execute(
    `
    UPDATE officers
    SET station_id = ?, first_name = ?, last_name = ?, \`rank\` = ?, badge_number = ?, phone = ?, email = ?
    WHERE officer_id = ?
    `,
    [
      stationId,
      firstName.trim(),
      lastName.trim(),
      rank.trim(),
      badgeNumber.trim(),
      phone ? phone.trim() : null,
      email.trim().toLowerCase(),
      id,
    ]
  )

  return findOfficerById(id)
}

export async function deleteOfficerById(id) {
  const [result] = await pool.execute(
    'DELETE FROM officers WHERE officer_id = ?',
    [id]
  )
  return result.affectedRows
}

export async function officerHasUsers(id) {
  const [rows] = await pool.execute(
    'SELECT user_id FROM users WHERE officer_id = ? LIMIT 1',
    [id]
  )

  return rows.length > 0
}

export async function badgeNumberExists(badge, excludeId = null) {
  let sql = 'SELECT officer_id FROM officers WHERE badge_number = ?'
  const params = [badge.trim()]

  if (excludeId) {
    sql += ' AND officer_id != ?'
    params.push(excludeId)
  }

  sql += ' LIMIT 1'

  const [rows] = await pool.execute(sql, params)
  return rows.length > 0
}

export async function emailExistsInOfficers(email, excludeId = null) {
  let sql = 'SELECT officer_id FROM officers WHERE email = ?'
  const params = [email.trim().toLowerCase()]

  if (excludeId) {
    sql += ' AND officer_id != ?'
    params.push(excludeId)
  }

  sql += ' LIMIT 1'

  const [rows] = await pool.execute(sql, params)
  return rows.length > 0
}
