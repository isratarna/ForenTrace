import pool from '../config/db.js' // MySQL connection pool import kora holo
// Shob query age database/sql/dna_matches.sql e raw SQL hishebe test kora hoyeche

// Reusable joined SELECT: match + duita sample (unknown = u, matched = ms) er person, family, lab info
// dna_samples table duibar JOIN kora hoyeche alada alias diye
const matchSelect = `
  SELECT
    m.match_id,
    m.unknown_sample_id,
    m.matched_sample_id,
    m.similarity_percentage,
    m.confidence_level,
    m.match_date,
    m.match_status,
    m.match_method,
    u.person_id AS unknown_person_id,
    CONCAT(up.first_name, ' ', up.last_name) AS unknown_person_name,
    u.family_id AS unknown_family_id,
    CONCAT(uf.first_name, ' ', uf.last_name) AS unknown_family_name,
    uf.relationship AS unknown_family_relationship,
    u.sample_type AS unknown_sample_type,
    u.dna_profile_code AS unknown_profile_code,
    ul.lab_name AS unknown_lab_name,
    ms.person_id AS matched_person_id,
    CONCAT(mp.first_name, ' ', mp.last_name) AS matched_person_name,
    mp.status AS matched_person_status,
    ms.family_id AS matched_family_id,
    CONCAT(mf.first_name, ' ', mf.last_name) AS matched_family_name,
    mf.relationship AS matched_family_relationship,
    ms.sample_type AS matched_sample_type,
    ms.dna_profile_code AS matched_profile_code,
    ml.lab_name AS matched_lab_name
  FROM dna_matches m
  INNER JOIN dna_samples u ON u.sample_id = m.unknown_sample_id
  INNER JOIN missing_persons up ON up.person_id = u.person_id
  LEFT JOIN family_members uf ON uf.family_id = u.family_id
  LEFT JOIN dna_labs ul ON ul.lab_id = u.lab_id
  INNER JOIN dna_samples ms ON ms.sample_id = m.matched_sample_id
  INNER JOIN missing_persons mp ON mp.person_id = ms.person_id
  LEFT JOIN family_members mf ON mf.family_id = ms.family_id
  LEFT JOIN dna_labs ml ON ml.lab_id = ms.lab_id
`

// Role onujayi match dekhar SQL condition — match er JE KONO ekta sample user er scope e thakle dekhbe
function scopeCondition(user) {
  if (!user || user.role === 'Admin') {
    return { sql: '', params: [] } // Admin shob match dekhbe
  }

  if (user.role === 'Officer') {
    // Kono ekta sample er missing person officer er assigned case e thakle
    return {
      sql: ` AND EXISTS (
        SELECT 1 FROM case_files cf_scope
        WHERE cf_scope.officer_id = ?
          AND cf_scope.person_id IN (u.person_id, ms.person_id)
      )`,
      params: [user.officerId ?? 0],
    }
  }

  if (user.role === 'Lab Technician') {
    // Kono ekta sample technician er lab e thakle
    const labSubquery = 'SELECT lt_scope.lab_id FROM lab_technicians lt_scope WHERE lt_scope.user_id = ? OR lt_scope.technician_id = ?'
    return {
      sql: ` AND (u.lab_id IN (${labSubquery}) OR ms.lab_id IN (${labSubquery}))`,
      params: [user.userId ?? 0, user.technicianId ?? 0, user.userId ?? 0, user.technicianId ?? 0],
    }
  }

  return { sql: ' AND 1 = 0', params: [] } // Unknown role → kichu na
}

// Shob match list (filter + role scope)
export async function findAllMatches({ status, confidence, personId, caseId, sampleId } = {}, user = null) {
  let sql = `${matchSelect} WHERE 1 = 1`
  const params = []

  if (status) {
    sql += ' AND m.match_status = ?'
    params.push(status)
  }

  if (confidence) {
    sql += ' AND m.confidence_level = ?'
    params.push(confidence)
  }

  if (personId) {
    // Missing person er kono sample (unknown ba matched) thakle
    sql += ' AND (u.person_id = ? OR ms.person_id = ?)'
    params.push(personId, personId)
  }

  if (caseId) {
    // Case er missing person er kono sample thakle
    sql += ' AND EXISTS (SELECT 1 FROM case_files cf_filter WHERE cf_filter.case_id = ? AND cf_filter.person_id IN (u.person_id, ms.person_id))'
    params.push(caseId)
  }

  if (sampleId) {
    sql += ' AND (m.unknown_sample_id = ? OR m.matched_sample_id = ?)'
    params.push(sampleId, sampleId)
  }

  const scope = scopeCondition(user)
  sql += scope.sql
  params.push(...scope.params)

  sql += ' ORDER BY m.match_id DESC'

  const [rows] = await pool.execute(sql, params)
  return rows
}

// Ekta match er details (scope shoho) — access na thakle null
export async function findMatchById(id, user = null) {
  const scope = scopeCondition(user)
  const [rows] = await pool.execute(
    `${matchSelect} WHERE m.match_id = ?${scope.sql} LIMIT 1`,
    [id, ...scope.params]
  )

  return rows[0] || null
}

// Option 1: duita sample er DNA profile code position-by-position compare (recursive CTE — dna_matches.sql query 1)
// similarity = mile jawa position / boro code er length * 100
export async function compareProfileCodes(unknownSampleId, matchedSampleId) {
  const [rows] = await pool.execute(
    `
    WITH RECURSIVE
    codes AS (
      SELECT
        u.dna_profile_code AS unknown_code,
        m.dna_profile_code AS matched_code,
        GREATEST(CHAR_LENGTH(u.dna_profile_code), CHAR_LENGTH(m.dna_profile_code)) AS max_length
      FROM dna_samples u
      INNER JOIN dna_samples m ON m.sample_id = ?
      WHERE u.sample_id = ?
    ),
    positions AS (
      SELECT 1 AS pos
      UNION ALL
      SELECT p.pos + 1
      FROM positions p
      INNER JOIN codes c ON p.pos < c.max_length
    )
    SELECT
      c.unknown_code,
      c.matched_code,
      c.max_length,
      SUM(SUBSTRING(c.unknown_code, p.pos, 1) = SUBSTRING(c.matched_code, p.pos, 1)) AS matching_positions,
      ROUND(SUM(SUBSTRING(c.unknown_code, p.pos, 1) = SUBSTRING(c.matched_code, p.pos, 1)) / c.max_length * 100, 2) AS similarity_percentage
    FROM codes c
    CROSS JOIN positions p
    GROUP BY c.unknown_code, c.matched_code, c.max_length
    `,
    [matchedSampleId, unknownSampleId]
  )

  return rows[0] || null
}

// Ei duita sample age theke (je kono direction e) compare kora hoyeche kina
export async function findMatchBetween(sampleA, sampleB) {
  const [rows] = await pool.execute(
    `
    SELECT match_id
    FROM dna_matches
    WHERE (unknown_sample_id = ? AND matched_sample_id = ?)
       OR (unknown_sample_id = ? AND matched_sample_id = ?)
    LIMIT 1
    `,
    [sampleA, sampleB, sampleB, sampleA]
  )

  return rows[0] || null
}

// Notun match record save — status shob somoy 'Pending Review' diye shuru
export async function createMatch({ unknownSampleId, matchedSampleId, similarityPercentage, confidenceLevel, matchMethod }) {
  const [result] = await pool.execute(
    `
    INSERT INTO dna_matches
      (unknown_sample_id, matched_sample_id, similarity_percentage, confidence_level, match_date, match_status, match_method)
    VALUES (?, ?, ?, ?, CURDATE(), 'Pending Review', ?)
    `,
    [unknownSampleId, matchedSampleId, similarityPercentage, confidenceLevel, matchMethod]
  )

  return findMatchById(result.insertId)
}

// Review: shudhu 'Pending Review' match Confirmed/Rejected kora jay (WHERE e check)
export async function updateMatchStatus(id, matchStatus) {
  const [result] = await pool.execute(
    `
    UPDATE dna_matches
    SET match_status = ?
    WHERE match_id = ?
      AND match_status = 'Pending Review'
    `,
    [matchStatus, id]
  )

  return result.affectedRows
}

// Match delete
export async function deleteMatchById(id) {
  const [result] = await pool.execute(
    'DELETE FROM dna_matches WHERE match_id = ?',
    [id]
  )

  return result.affectedRows
}
