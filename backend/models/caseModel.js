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

const joinedCaseSelect = `
  SELECT
    cf.case_id,
    cf.person_id,
    cf.station_id,
    cf.officer_id,
    cf.report_date,
    cf.case_status,
    cf.priority,
    cf.identified_date,
    cf.case_notes,
    CONCAT(mp.first_name, ' ', mp.last_name) AS missing_person_name,
    ps.station_name,
    CONCAT(o.first_name, ' ', o.last_name) AS officer_name,
    o.badge_number AS officer_badge_number
  FROM case_files cf
  INNER JOIN missing_persons mp ON cf.person_id = mp.person_id
  INNER JOIN police_stations ps ON cf.station_id = ps.station_id
  INNER JOIN officers o ON cf.officer_id = o.officer_id
`

export async function findAllCases({ search } = {}) {
  let sql = `${joinedCaseSelect} WHERE 1 = 1`
  const params = []

  if (search) {
    sql += `
      AND (
        cf.case_id = ?
        OR CONCAT(mp.first_name, ' ', mp.last_name) LIKE ?
        OR ps.station_name LIKE ?
        OR CONCAT(o.first_name, ' ', o.last_name) LIKE ?
        OR o.badge_number LIKE ?
      )
    `
    const term = `%${search}%`
    const searchId = Number.isInteger(Number(search)) ? Number(search) : 0
    params.push(searchId, term, term, term, term)
  }

  sql += ' ORDER BY cf.case_id ASC'

  const [rows] = await pool.execute(sql, params)

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
    FROM police_stations ps
    LEFT JOIN case_files cf ON cf.station_id = ps.station_id
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

export async function findOfficersAboveAverageCaseWorkload() {
  const [rows] = await pool.execute(
    `
    SELECT
      o.officer_id,
      CONCAT(o.first_name, ' ', o.last_name) AS officer_name,
      o.badge_number,
      o.station_id,
      ps.station_name,
      (
        SELECT COUNT(*)
        FROM case_files assigned_cases
        WHERE assigned_cases.officer_id = o.officer_id
          AND assigned_cases.station_id = o.station_id
      ) AS assigned_case_count,
      workload_average.average_active_officer_workload
    FROM officers o
    INNER JOIN police_stations ps ON ps.station_id = o.station_id
    CROSS JOIN (
      SELECT
        ROUND(AVG(active_officer_workloads.assigned_case_count), 2)
          AS average_active_officer_workload
      FROM (
        SELECT
          cf.station_id,
          cf.officer_id,
          COUNT(*) AS assigned_case_count
        FROM case_files cf
        GROUP BY cf.station_id, cf.officer_id
      ) active_officer_workloads
    ) workload_average
    WHERE (
      SELECT COUNT(*)
      FROM case_files assigned_cases
      WHERE assigned_cases.officer_id = o.officer_id
        AND assigned_cases.station_id = o.station_id
    ) > workload_average.average_active_officer_workload
    ORDER BY assigned_case_count DESC, officer_name ASC
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
