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
