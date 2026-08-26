import pool from '../config/db.js'

export async function findAllMissingPersons({ search, status, gender, city, missingDate } = {}) {
  let sql = `
    SELECT 
      person_id,
      first_name,
      last_name,
      gender,
      date_of_birth,
      national_id,
      blood_group,
      height,
      weight,
      eye_color,
      hair_color,
      photo,
      missing_date,
      last_seen_location,
      city,
      description,
      status
    FROM missing_persons
    WHERE 1 = 1
  `
  const params = []

  if (status) {
    sql += ' AND status = ?'
    params.push(status)
  }

  if (gender) {
    sql += ' AND gender = ?'
    params.push(gender)
  }

  if (city) {
    sql += ' AND city = ?'
    params.push(city)
  }

  if (missingDate) {
    sql += ' AND missing_date = ?'
    params.push(missingDate)
  }

  if (search) {
    sql += ' AND (first_name LIKE ? OR last_name LIKE ? OR CONCAT(first_name, " ", last_name) LIKE ? OR person_id = ? OR national_id = ? OR city LIKE ? OR last_seen_location LIKE ?)'
    const term = `%${search}%`
    // If search is a number, we can match person_id, otherwise we pass 0 or search
    const searchId = Number(search) || 0
    params.push(term, term, term, searchId, search, term, term)
  }

  sql += ' ORDER BY person_id DESC'

  const [rows] = await pool.execute(sql, params)
  return rows
}

export async function findMissingPersonById(id) {
  const [rows] = await pool.execute(
    `
    SELECT 
      person_id,
      first_name,
      last_name,
      gender,
      date_of_birth,
      national_id,
      blood_group,
      height,
      weight,
      eye_color,
      hair_color,
      photo,
      missing_date,
      last_seen_location,
      city,
      description,
      status
    FROM missing_persons
    WHERE person_id = ?
    LIMIT 1
    `,
    [id]
  )
  return rows[0] || null
}

export async function createMissingPerson({
  firstName,
  lastName,
  gender = null,
  dateOfBirth = null,
  nationalId = null,
  bloodGroup = null,
  height = null,
  weight = null,
  eyeColor = null,
  hairColor = null,
  photo = null,
  missingDate,
  lastSeenLocation = null,
  city = null,
  description = null,
  status = 'Missing',
}) {
  const [result] = await pool.execute(
    `
    INSERT INTO missing_persons
      (first_name, last_name, gender, date_of_birth, national_id, blood_group, height, weight, eye_color, hair_color, photo, missing_date, last_seen_location, city, description, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      firstName.trim(),
      lastName.trim(),
      gender ? gender.trim() : null,
      dateOfBirth || null,
      nationalId ? nationalId.trim() : null,
      bloodGroup ? bloodGroup.trim() : null,
      height || null,
      weight || null,
      eyeColor ? eyeColor.trim() : null,
      hairColor ? hairColor.trim() : null,
      photo ? photo.trim() : null,
      missingDate,
      lastSeenLocation ? lastSeenLocation.trim() : null,
      city ? city.trim() : null,
      description ? description.trim() : null,
      status.trim(),
    ]
  )

  return findMissingPersonById(result.insertId)
}

export async function updateMissingPersonById(id, {
  firstName,
  lastName,
  gender = null,
  dateOfBirth = null,
  nationalId = null,
  bloodGroup = null,
  height = null,
  weight = null,
  eyeColor = null,
  hairColor = null,
  photo = null,
  missingDate,
  lastSeenLocation = null,
  city = null,
  description = null,
  status,
}) {
  await pool.execute(
    `
    UPDATE missing_persons
    SET first_name = ?, last_name = ?, gender = ?, date_of_birth = ?, national_id = ?, blood_group = ?, height = ?, weight = ?, eye_color = ?, hair_color = ?, photo = ?, missing_date = ?, last_seen_location = ?, city = ?, description = ?, status = ?
    WHERE person_id = ?
    `,
    [
      firstName.trim(),
      lastName.trim(),
      gender ? gender.trim() : null,
      dateOfBirth || null,
      nationalId ? nationalId.trim() : null,
      bloodGroup ? bloodGroup.trim() : null,
      height || null,
      weight || null,
      eyeColor ? eyeColor.trim() : null,
      hairColor ? hairColor.trim() : null,
      photo ? photo.trim() : null,
      missingDate,
      lastSeenLocation ? lastSeenLocation.trim() : null,
      city ? city.trim() : null,
      description ? description.trim() : null,
      status.trim(),
      id,
    ]
  )

  return findMissingPersonById(id)
}

export async function deleteMissingPersonById(id) {
  const [result] = await pool.execute(
    'DELETE FROM missing_persons WHERE person_id = ?',
    [id]
  )
  return result.affectedRows
}

export async function missingPersonHasCases(id) {
  const [rows] = await pool.execute(
    'SELECT case_id FROM case_files WHERE person_id = ? LIMIT 1',
    [id]
  )
  return rows.length > 0
}

export async function nationalIdExists(nationalId, excludeId = null) {
  if (!nationalId) return false
  let sql = 'SELECT person_id FROM missing_persons WHERE national_id = ?'
  const params = [nationalId.trim()]

  if (excludeId) {
    sql += ' AND person_id != ?'
    params.push(excludeId)
  }

  sql += ' LIMIT 1'

  const [rows] = await pool.execute(sql, params)
  return rows.length > 0
}
