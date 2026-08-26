import pool from '../config/db.js'

export async function findAllMissingPersons({ search, status, gender, city, missingDate, missingDateFrom, missingDateTo } = {}) {
  let sql = `
    SELECT 
      mp.person_id AS person_id,
      mp.first_name,
      mp.last_name,
      mp.gender,
      mp.date_of_birth,
      mp.national_id,
      mp.blood_group,
      mp.height,
      mp.weight,
      mp.eye_color,
      mp.hair_color,
      mp.photo,
      mp.missing_date,
      mp.last_seen_location,
      mp.city,
      mp.description,
      mp.status,
      cf.case_id,
      CASE WHEN cf.case_id IS NULL THEN 0 ELSE 1 END AS has_case
    FROM missing_persons AS mp
    LEFT JOIN case_files AS cf ON cf.person_id = mp.person_id
    WHERE 1 = 1
  `
  const params = []

  if (status) {
    sql += ' AND mp.status = ?'
    params.push(status)
  }

  if (gender) {
    sql += ' AND mp.gender = ?'
    params.push(gender)
  }

  if (city) {
    sql += ' AND mp.city = ?'
    params.push(city)
  }

  if (missingDate) {
    sql += ' AND mp.missing_date = ?'
    params.push(missingDate)
  }

  if (missingDateFrom) {
    sql += ' AND mp.missing_date >= ?'
    params.push(missingDateFrom)
  }

  if (missingDateTo) {
    sql += ' AND mp.missing_date <= ?'
    params.push(missingDateTo)
  }

  if (search) {
    sql += ' AND (mp.first_name LIKE ? OR mp.last_name LIKE ? OR CONCAT(mp.first_name, " ", mp.last_name) LIKE ? OR mp.person_id = ? OR mp.national_id = ? OR mp.city LIKE ? OR mp.last_seen_location LIKE ?)'
    const term = `%${search}%`
    // If search is a number, we can match person_id, otherwise we pass 0 or search
    const searchId = Number(search) || 0
    params.push(term, term, term, searchId, search, term, term)
  }

  sql += ' ORDER BY mp.person_id DESC'

  const [rows] = await pool.execute(sql, params)
  return rows
}

export async function findMissingPersonStatistics() {
  const [summaryRows] = await pool.execute(`
    SELECT
      COUNT(*) AS total_missing_persons,
      SUM(CASE WHEN status = 'Missing' THEN 1 ELSE 0 END) AS currently_missing,
      SUM(CASE WHEN status = 'Identified' THEN 1 ELSE 0 END) AS identified,
      COUNT(DISTINCT city) AS cities_affected,
      MIN(missing_date) AS earliest_missing_date,
      MAX(missing_date) AS latest_missing_date,
      ROUND(AVG(height), 2) AS average_height,
      ROUND(AVG(weight), 2) AS average_weight
    FROM missing_persons
  `)
  const [cityRows] = await pool.execute(`
    SELECT city, COUNT(*) AS total_persons,
      SUM(CASE WHEN status = 'Missing' THEN 1 ELSE 0 END) AS currently_missing,
      SUM(CASE WHEN status = 'Identified' THEN 1 ELSE 0 END) AS identified,
      MIN(missing_date) AS earliest_missing_date,
      MAX(missing_date) AS latest_missing_date
    FROM missing_persons
    WHERE city IS NOT NULL AND city <> ''
    GROUP BY city
    ORDER BY total_persons DESC, city ASC
  `)
  const [havingRows] = await pool.execute(`
    SELECT city, COUNT(*) AS total_persons
    FROM missing_persons
    WHERE city IS NOT NULL AND city <> ''
    GROUP BY city
    HAVING COUNT(*) >= 2
    ORDER BY total_persons DESC, city ASC
  `)
  return { summary: summaryRows[0], byCity: cityRows, citiesWithAtLeastTwo: havingRows }
}

export async function findMissingPersonsFromAboveAverageCities() {
  const [rows] = await pool.execute(`
    SELECT mp.person_id, mp.first_name, mp.last_name, mp.city, mp.status, mp.missing_date
    FROM missing_persons mp
    WHERE EXISTS (
      SELECT 1
      FROM (
        SELECT city, COUNT(*) AS city_count
        FROM missing_persons
        WHERE city IS NOT NULL AND city <> ''
        GROUP BY city
      ) city_counts
      WHERE city_counts.city = mp.city
        AND city_counts.city_count > (
          SELECT AVG(city_count)
          FROM (
            SELECT city, COUNT(*) AS city_count
            FROM missing_persons
            WHERE city IS NOT NULL AND city <> ''
            GROUP BY city
          ) average_city_counts
        )
    )
    ORDER BY mp.city ASC, mp.person_id ASC
  `)
  return rows
}

export async function findMissingPersonById(id) {
  const [rows] = await pool.execute(
    `
    SELECT 
      mp.person_id,
      mp.first_name,
      mp.last_name,
      mp.gender,
      mp.date_of_birth,
      mp.national_id,
      mp.blood_group,
      mp.height,
      mp.weight,
      mp.eye_color,
      mp.hair_color,
      mp.photo,
      mp.missing_date,
      mp.last_seen_location,
      mp.city,
      mp.description,
      mp.status,
      cf.case_id,
      CASE WHEN cf.case_id IS NULL THEN 0 ELSE 1 END AS has_case
    FROM missing_persons AS mp
    LEFT JOIN case_files AS cf ON cf.person_id = mp.person_id
    WHERE mp.person_id = ?
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
