import pool from '../config/db.js'

const caseSelect = `
  SELECT
    case_id,
    person_id,
    station_id,
    officer_id,
    report_date,
    case_status,
    priority,
    identified_date,
    case_notes
  FROM case_files
`

export async function findAllCases() {
  const [rows] = await pool.execute(
    `${caseSelect} ORDER BY case_id ASC`
  )

  return rows
}

export async function findCaseById(id) {
  const [rows] = await pool.execute(
    `${caseSelect} WHERE case_id = ? LIMIT 1`,
    [id]
  )

  return rows[0] || null
}

export async function findCaseStatisticsSummary() {
  const [rows] = await pool.execute(
    `
    SELECT
      COUNT(*) AS total_cases,
      SUM(CASE WHEN case_status = 'Active' THEN 1 ELSE 0 END) AS active_cases,
      SUM(CASE WHEN case_status = 'Solved' THEN 1 ELSE 0 END) AS solved_cases,
      SUM(CASE WHEN case_status = 'Pending' THEN 1 ELSE 0 END) AS pending_cases,
      SUM(CASE WHEN priority = 'High' THEN 1 ELSE 0 END) AS high_priority_cases,
      ROUND(
        AVG(
          CASE
            WHEN case_status = 'Solved' AND identified_date IS NOT NULL
              THEN DATEDIFF(identified_date, report_date)
            ELSE NULL
          END
        ),
        2
      ) AS average_resolution_days
    FROM case_files
    `
  )

  return rows[0]
}

export async function findStationCaseStatistics() {
  const [rows] = await pool.execute(
    `
    SELECT
      ps.station_id,
      ps.station_name,
      COUNT(cf.case_id) AS total_cases,
      SUM(CASE WHEN cf.case_status = 'Active' THEN 1 ELSE 0 END) AS active_cases,
      SUM(CASE WHEN cf.case_status = 'Solved' THEN 1 ELSE 0 END) AS solved_cases,
      SUM(CASE WHEN cf.case_status = 'Pending' THEN 1 ELSE 0 END) AS pending_cases,
      SUM(CASE WHEN cf.priority = 'High' THEN 1 ELSE 0 END) AS high_priority_cases,
      MIN(cf.report_date) AS earliest_case_date,
      MAX(cf.report_date) AS latest_case_date
    FROM case_files cf
    INNER JOIN police_stations ps ON cf.station_id = ps.station_id
    GROUP BY ps.station_id, ps.station_name
    ORDER BY total_cases DESC, ps.station_name ASC
    `
  )

  return rows
}

export async function findOfficerCaseStatistics() {
  const [rows] = await pool.execute(
    `
    SELECT
      o.officer_id,
      CONCAT(o.first_name, ' ', o.last_name) AS officer_name,
      ps.station_name,
      COUNT(cf.case_id) AS total_cases,
      SUM(CASE WHEN cf.case_status = 'Active' THEN 1 ELSE 0 END) AS active_cases,
      SUM(CASE WHEN cf.case_status = 'Solved' THEN 1 ELSE 0 END) AS solved_cases,
      SUM(CASE WHEN cf.case_status = 'Pending' THEN 1 ELSE 0 END) AS pending_cases,
      SUM(CASE WHEN cf.priority = 'High' THEN 1 ELSE 0 END) AS high_priority_cases
    FROM case_files cf
    INNER JOIN officers o ON cf.officer_id = o.officer_id
    INNER JOIN police_stations ps ON cf.station_id = ps.station_id
    GROUP BY o.officer_id, o.first_name, o.last_name, ps.station_name
    HAVING COUNT(cf.case_id) >= 3
    ORDER BY total_cases DESC, officer_name ASC
    `
  )

  return rows
}

export async function findMissingPersonById(personId) {
  const [rows] = await pool.execute(
    'SELECT person_id FROM missing_persons WHERE person_id = ? LIMIT 1',
    [personId]
  )

  return rows[0] || null
}

export async function findCaseStationById(stationId) {
  const [rows] = await pool.execute(
    'SELECT station_id FROM police_stations WHERE station_id = ? LIMIT 1',
    [stationId]
  )

  return rows[0] || null
}

export async function findCaseOfficerById(officerId) {
  const [rows] = await pool.execute(
    'SELECT officer_id, station_id FROM officers WHERE officer_id = ? LIMIT 1',
    [officerId]
  )

  return rows[0] || null
}

export async function caseExistsForPerson(personId) {
  const [rows] = await pool.execute(
    'SELECT case_id FROM case_files WHERE person_id = ? LIMIT 1',
    [personId]
  )

  return rows.length > 0
}

export async function createCase({
  personId,
  stationId,
  officerId,
  reportDate,
  caseStatus,
  priority,
  identifiedDate = null,
  caseNotes = null,
}) {
  const [result] = await pool.execute(
    `
    INSERT INTO case_files
      (person_id, station_id, officer_id, report_date, case_status, priority, identified_date, case_notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      personId,
      stationId,
      officerId,
      reportDate,
      caseStatus,
      priority,
      identifiedDate,
      caseNotes,
    ]
  )

  return findCaseById(result.insertId)
}

export async function updateCaseById(id, {
  stationId,
  officerId,
  caseStatus,
  priority,
  identifiedDate = null,
  caseNotes = null,
}) {
  await pool.execute(
    `
    UPDATE case_files
    SET station_id = ?, officer_id = ?, case_status = ?, priority = ?, identified_date = ?, case_notes = ?
    WHERE case_id = ?
    `,
    [
      stationId,
      officerId,
      caseStatus,
      priority,
      identifiedDate,
      caseNotes,
      id,
    ]
  )

  return findCaseById(id)
}

export async function deleteCaseById(id) {
  const [result] = await pool.execute(
    'DELETE FROM case_files WHERE case_id = ?',
    [id]
  )

  return result.affectedRows
}
