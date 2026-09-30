import pool from '../config/db.js'

const connection = await pool.getConnection()
try {
  await connection.beginTransaction()
  const [officers] = await connection.query('SELECT officer_id, station_id FROM officers ORDER BY officer_id')
  if (!officers.length) throw new Error('Seed at least one officer first.')
  const names = [['Arif', 'Rahman'], ['Mita', 'Akter'], ['Kamal', 'Hasan'], ['Rina', 'Begum'], ['Sajib', 'Ahmed'], ['Nila', 'Islam']]
  for (const [index, [first, last]] of names.entries()) {
    const solved = index < 3
    const nationalId = `DEMO-CASE-STATUS-${index + 1}`
    const [existing] = await connection.query('SELECT person_id FROM missing_persons WHERE national_id = ?', [nationalId])
    if (existing.length) continue
    const [person] = await connection.query(
      `INSERT INTO missing_persons (first_name, last_name, national_id, missing_date, city, description, status)
       VALUES (?, ?, ?, DATE_SUB(CURDATE(), INTERVAL 20 DAY), 'Dhaka', 'Synthetic demo record for case status seeding', ?)`,
      [first, last, nationalId, solved ? 'Identified' : 'Missing'],
    )
    const officer = officers[index % officers.length]
    await connection.query(
      `INSERT INTO case_files (person_id, station_id, officer_id, report_date, case_status, priority, identified_date, case_notes)
       VALUES (?, ?, ?, DATE_SUB(CURDATE(), INTERVAL 19 DAY), ?, ?, ${solved ? 'DATE_SUB(CURDATE(), INTERVAL 3 DAY)' : 'NULL'}, ?)`,
      [person.insertId, officer.station_id, officer.officer_id, solved ? 'Solved' : 'Pending', ['High', 'Medium', 'Low'][index % 3], 'Synthetic demo case seeded for dashboard status examples.'],
    )
  }
  await connection.commit()
  const [counts] = await connection.query('SELECT case_status, COUNT(*) AS total FROM case_files GROUP BY case_status')
  console.table(counts)
} catch (error) {
  await connection.rollback()
  console.error(error.message)
  process.exitCode = 1
} finally {
  connection.release()
  await pool.end()
}
