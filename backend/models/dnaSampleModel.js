import pool from '../config/db.js' // MySQL connection pool import kora holo
// Shob query age database/sql/dna_samples.sql e raw SQL hishebe test kora hoyeche

// Reusable joined SELECT: sample er sathe missing person, family member, lab, technician ar case info
// INNER JOIN missing_persons karon proti sample obosshoi ekta missing person er
// baki gulo LEFT JOIN karon family / lab / technician / case na thakleo sample dekhate hobe
const sampleSelect = `
  SELECT
    s.sample_id,
    s.person_id,
    s.family_id,
    s.lab_id,
    s.technician_id,
    s.sample_type,
    s.collection_date,
    s.storage_location,
    s.remarks,
    s.analysis_date,
    s.dna_profile_code,
    s.status,
    s.created_at,
    s.updated_at,
    CONCAT(mp.first_name, ' ', mp.last_name) AS person_name,
    mp.status AS person_status,
    CONCAT(fm.first_name, ' ', fm.last_name) AS family_member_name,
    fm.relationship AS family_relationship,
    dl.lab_name,
    CONCAT(lt.first_name, ' ', lt.last_name) AS technician_name,
    cf.case_id,
    cf.officer_id AS case_officer_id
  FROM dna_samples s
  INNER JOIN missing_persons mp ON s.person_id = mp.person_id
  LEFT JOIN family_members fm ON s.family_id = fm.family_id
  LEFT JOIN dna_labs dl ON s.lab_id = dl.lab_id
  LEFT JOIN lab_technicians lt ON s.technician_id = lt.technician_id
  LEFT JOIN case_files cf ON cf.person_id = s.person_id
`

// Role onujayi row-level access er SQL condition banay
// Admin: shob sample, Officer: shudhu nijer assigned case er sample, Technician: shudhu nijer lab er sample
function scopeCondition(user) {
  if (!user || user.role === 'Admin') {
    return { sql: '', params: [] } // Admin (ba internal call) hole kono filter lagbe na
  }

  if (user.role === 'Officer') {
    return { sql: ' AND cf.officer_id = ?', params: [user.officerId ?? 0] } // officer_id na thakle 0 → kichui dekhabe na
  }

  if (user.role === 'Lab Technician') {
    // Logged-in user er technician profile theke lab_id ber kore shei lab er sample filter kora hocche
    return {
      sql: ` AND s.lab_id IN (
        SELECT lt_scope.lab_id
        FROM lab_technicians lt_scope
        WHERE lt_scope.user_id = ? OR lt_scope.technician_id = ?
      )`,
      params: [user.userId ?? 0, user.technicianId ?? 0],
    }
  }

  return { sql: ' AND 1 = 0', params: [] } // Unknown role hole kono data dibo na
}

// Shob DNA sample list (search + filter + role scope shoho)
export async function findAllSamples({ search, status, personId, familyId, labId, caseId } = {}, user = null) {
  let sql = `${sampleSelect} WHERE 1 = 1` // WHERE 1 = 1 dile porer AND condition gulo shohoje jora jay
  const params = [] // ? placeholder er value gulo ekhane rakha hobe (SQL injection theke bachay)

  if (status) {
    sql += ' AND s.status = ?'
    params.push(status)
  }

  if (personId) {
    sql += ' AND s.person_id = ?'
    params.push(personId)
  }

  if (familyId) {
    sql += ' AND s.family_id = ?'
    params.push(familyId)
  }

  if (labId) {
    sql += ' AND s.lab_id = ?'
    params.push(labId)
  }

  if (caseId) {
    sql += ' AND cf.case_id = ?'
    params.push(caseId)
  }

  if (search) {
    // Sample id, person name, family member name, lab name, sample type ba profile code diye search
    sql += `
      AND (
        s.sample_id = ?
        OR CONCAT(mp.first_name, ' ', mp.last_name) LIKE ?
        OR CONCAT(fm.first_name, ' ', fm.last_name) LIKE ?
        OR dl.lab_name LIKE ?
        OR s.sample_type LIKE ?
        OR s.dna_profile_code LIKE ?
      )
    `
    const term = `%${search}%` // wildcard search
    const searchId = Number.isInteger(Number(search)) ? Number(search) : 0
    params.push(searchId, term, term, term, term, term)
  }

  const scope = scopeCondition(user) // role based filter jog kora
  sql += scope.sql
  params.push(...scope.params)

  sql += ' ORDER BY s.sample_id DESC' // notun sample age dekhabe

  const [rows] = await pool.execute(sql, params)
  return rows
}

// Ekta sample er details (role scope shoho) — access na thakle null return korbe
export async function findSampleById(id, user = null) {
  const scope = scopeCondition(user)
  const [rows] = await pool.execute(
    `${sampleSelect} WHERE s.sample_id = ?${scope.sql} LIMIT 1`,
    [id, ...scope.params]
  )

  return rows[0] || null
}

// Notun DNA sample register kora — status shob somoy 'Awaiting Analysis' diye shuru
export async function createSample({
  personId,
  familyId = null,
  labId,
  technicianId = null,
  sampleType,
  collectionDate,
  storageLocation = null,
  remarks = null,
}) {
  const [result] = await pool.execute(
    `
    INSERT INTO dna_samples
      (person_id, family_id, lab_id, technician_id, sample_type, collection_date, storage_location, remarks, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Awaiting Analysis')
    `,
    [personId, familyId, labId, technicianId, sampleType, collectionDate, storageLocation, remarks]
  )

  return findSampleById(result.insertId) // insert howa row ta join shoho ferot dei
}

// Sample er collection/investigation info update — analysis field gulo ekhane change hoy na
export async function updateSampleById(id, {
  personId,
  familyId = null,
  labId,
  technicianId = null,
  sampleType,
  collectionDate,
  storageLocation = null,
  remarks = null,
}) {
  await pool.execute(
    `
    UPDATE dna_samples
    SET person_id = ?, family_id = ?, lab_id = ?, technician_id = ?, sample_type = ?,
        collection_date = ?, storage_location = ?, remarks = ?
    WHERE sample_id = ?
    `,
    [personId, familyId, labId, technicianId, sampleType, collectionDate, storageLocation, remarks, id]
  )

  return findSampleById(id)
}

// Sample delete kora
export async function deleteSampleById(id) {
  const [result] = await pool.execute(
    'DELETE FROM dna_samples WHERE sample_id = ?',
    [id]
  )

  return result.affectedRows // koyta row delete holo
}

// Niche validation er jonno choto lookup query gulo (register/update er age check kora hoy)

// Missing person ache kina check
export async function findPersonForSample(personId) {
  const [rows] = await pool.execute(
    'SELECT person_id FROM missing_persons WHERE person_id = ? LIMIT 1',
    [personId]
  )

  return rows[0] || null
}

// Family member ta ki ei missing person er? (onno person er family diye sample register atkano)
export async function familyMemberBelongsToPerson(familyId, personId) {
  const [rows] = await pool.execute(
    'SELECT family_id FROM family_members WHERE family_id = ? AND person_id = ? LIMIT 1',
    [familyId, personId]
  )

  return rows.length > 0
}

// DNA lab ache kina check
export async function findLabForSample(labId) {
  const [rows] = await pool.execute(
    'SELECT lab_id FROM dna_labs WHERE lab_id = ? LIMIT 1',
    [labId]
  )

  return rows[0] || null
}

// Technician ki selected lab e kaj kore? (onno lab er technician assign atkano)
export async function technicianBelongsToLab(technicianId, labId) {
  const [rows] = await pool.execute(
    'SELECT technician_id FROM lab_technicians WHERE technician_id = ? AND lab_id = ? LIMIT 1',
    [technicianId, labId]
  )

  return rows.length > 0
}

// Officer ki ei missing person er case e assigned? (officer shudhu nijer case er sample manage korbe)
export async function officerAssignedToPerson(officerId, personId) {
  const [rows] = await pool.execute(
    'SELECT case_id FROM case_files WHERE officer_id = ? AND person_id = ? LIMIT 1',
    [officerId ?? 0, personId]
  )

  return rows.length > 0
}

// ---------- Family DNA Reference Integration (Member 1 - Issue 2) ----------
// Query gulo database/sql/dna_samples.sql er 9-12 number section e test kora

// Family member ke tar missing person (person_id) shoho khuje ber kora
export async function findFamilyMemberForSample(familyId) {
  const [rows] = await pool.execute(
    `
    SELECT family_id, person_id, first_name, last_name, relationship
    FROM family_members
    WHERE family_id = ?
    LIMIT 1
    `,
    [familyId]
  )

  return rows[0] || null
}

// Family reference sample register — INSERT ... SELECT diye person_id family_members theke neya hoy,
// tai sample shob somoy family member er missing person er sathei link hobe
export async function createFamilySample(familyId, {
  labId,
  technicianId = null,
  sampleType,
  collectionDate,
  storageLocation = null,
  remarks = null,
}) {
  const [result] = await pool.execute(
    `
    INSERT INTO dna_samples
      (person_id, family_id, lab_id, technician_id, sample_type, collection_date, storage_location, remarks, status)
    SELECT fm.person_id, fm.family_id, ?, ?, ?, ?, ?, ?, 'Awaiting Analysis'
    FROM family_members fm
    WHERE fm.family_id = ?
    `,
    [labId, technicianId, sampleType, collectionDate, storageLocation, remarks, familyId]
  )

  if (!result.affectedRows) return null // family member na thakle kichu insert hoy na
  return findSampleById(result.insertId)
}

// Ekta missing person er shob family member + tader reference sample (LEFT JOIN — sample na thakleo member ashbe)
export async function findFamilyDnaByPerson(personId) {
  const [rows] = await pool.execute(
    `
    SELECT
      fm.family_id,
      CONCAT(fm.first_name, ' ', fm.last_name) AS family_member_name,
      fm.relationship,
      fm.phone,
      s.sample_id,
      s.sample_type,
      s.collection_date,
      s.status AS sample_status,
      s.analysis_date,
      s.dna_profile_code,
      dl.lab_name
    FROM family_members fm
    LEFT JOIN dna_samples s ON s.family_id = fm.family_id
    LEFT JOIN dna_labs dl ON dl.lab_id = s.lab_id
    WHERE fm.person_id = ?
    ORDER BY fm.family_id ASC, s.sample_id ASC
    `,
    [personId]
  )

  return rows
}

// Family DNA coverage summary — koto jon member, koto jon sample diyeche, koto gula analyzed
export async function findFamilyDnaSummary(personId) {
  const [rows] = await pool.execute(
    `
    SELECT
      COUNT(DISTINCT fm.family_id) AS total_family_members,
      COUNT(DISTINCT s.family_id) AS members_with_sample,
      COUNT(s.sample_id) AS total_reference_samples,
      SUM(CASE WHEN s.status = 'Analyzed' THEN 1 ELSE 0 END) AS analyzed_reference_samples
    FROM family_members fm
    LEFT JOIN dna_samples s ON s.family_id = fm.family_id
    WHERE fm.person_id = ?
    `,
    [personId]
  )

  return rows[0]
}
