import pool from '../config/db.js'

// Re-running preserves reviewed demos instead of resetting their statuses.
const connection = await pool.getConnection()
try {
  const [triggers] = await connection.query("SHOW TRIGGERS WHERE `Table` = 'dna_matches'")
  if (!triggers.some(t => t.Trigger === 'trg_dna_match_confirmed_update')) {
    throw new Error('Install the DNA confirmation trigger before seeding these demos.')
  }
  await connection.beginTransaction()
  const [officers] = await connection.query('SELECT officer_id, station_id FROM officers ORDER BY officer_id LIMIT 1')
  const [labs] = await connection.query('SELECT lab_id FROM dna_labs ORDER BY lab_id LIMIT 1')
  if (!officers.length || !labs.length) throw new Error('An officer and DNA lab are required.')
  const officer = officers[0]
  const names = [['Ayan', 'Rahman'], ['Nabila', 'Hasan'], ['Sami', 'Ahmed']]
  for (const [index, [first, last]] of names.entries()) {
    const marker = `DEMO-DNA-TRIGGER-${index + 1}`
    const [existing] = await connection.query('SELECT person_id FROM missing_persons WHERE national_id = ?', [marker])
    if (existing.length) continue
    const [person] = await connection.execute(
      `INSERT INTO missing_persons (first_name, last_name, national_id, missing_date, city, description, status)
       VALUES (?, ?, ?, CURDATE(), 'Dhaka', ?, 'Missing')`,
      [first, last, marker, `Synthetic trigger demo ${index + 1}: confirm the pending DNA match to identify this person.`],
    )
    const personId = person.insertId
    await connection.execute(
      `INSERT INTO case_files (person_id, station_id, officer_id, report_date, case_status, priority, case_notes)
       VALUES (?, ?, ?, CURDATE(), 'Pending', 'High', ?)`,
      [personId, officer.station_id, officer.officer_id, marker],
    )
    const [family] = await connection.execute(
      `INSERT INTO family_members (person_id, first_name, last_name, relationship, phone, remarks)
       VALUES (?, 'Demo Father', ?, 'Father', '01000000000', ?)`,
      [personId, last, `Synthetic reference donor for ${marker}`],
    )
    const samples = []
    for (const reference of [false, true]) {
      const [sample] = await connection.execute(
        `INSERT INTO dna_samples (person_id, family_id, lab_id, sample_type, collection_date,
          storage_location, remarks, analysis_date, dna_profile_code, status)
         VALUES (?, ?, ?, ?, CURDATE(), 'Demo Storage', ?, CURDATE(), ?, 'Analyzed')`,
        [personId, reference ? family.insertId : null, labs[0].lab_id,
          reference ? 'Buccal Swab' : 'Personal Belonging', marker,
          `DEMO${index + 1}ABCDE${reference ? '9' : '1'}`],
      )
      samples.push(sample.insertId)
    }
    await connection.execute(
      `INSERT INTO dna_matches (unknown_sample_id, matched_sample_id, similarity_percentage,
        confidence_level, match_date, match_status, match_method)
       VALUES (?, ?, 90.91, 'High', CURDATE(), 'Pending Review', 'Computed')`, samples,
    )
  }
  await connection.commit()
  const [rows] = await connection.query(
    `SELECT p.national_id AS demo, CONCAT(p.first_name, ' ', p.last_name) AS person,
      p.person_id, p.status AS person_status, m.match_id, m.match_status,
      m.unknown_sample_id, m.matched_sample_id, cf.officer_id
     FROM missing_persons p
     JOIN dna_samples s ON s.person_id = p.person_id AND s.family_id IS NOT NULL
     JOIN dna_matches m ON m.matched_sample_id = s.sample_id
     LEFT JOIN case_files cf ON cf.person_id = p.person_id
     WHERE p.national_id IN ('DEMO-DNA-TRIGGER-1', 'DEMO-DNA-TRIGGER-2', 'DEMO-DNA-TRIGGER-3')
     ORDER BY p.national_id`,
  )
  console.table(rows)
} catch (error) {
  await connection.rollback()
  console.error(error.message)
  process.exitCode = 1
} finally {
  connection.release()
  await pool.end()
}
