# ForenTrace — Member 1 Change Log

**Scope:** DNA Sample Management, DNA Matching & Laboratory Workflow
**Flow:** DNA Sample Collection → DNA Analysis → DNA Comparison → DNA Match Result

This file records every change made for Member 1, phase by phase. Each phase matches one GitHub issue. For each file you get:

- what the file is for,
- how the important parts work,
- the full code that was added or changed.

## Phase overview

| Phase | Issue | Status |
|---|---|---|
| 1 | Issue 1: DNA Sample Management Module | ✅ Done |
| 2 | Issue 2: Family DNA Reference Integration | ✅ Done |
| 3 | Issue 3: Laboratory DNA Analysis Workflow | ✅ Done |
| 4 | Issue 4: DNA Matching Workflow | ✅ Done |
| 5 | Issue 5: SQL Trigger (automatic identification update) | ✅ Done |
| 6 | Issue 6: SQL UNION Report | ⏳ Pending |
| 7 | Issue 7: Connect the lab frontend to the real backend | ⏳ Pending |

---

# Phase 1 — Issue 1: DNA Sample Management Module

## Goal

Store and manage collected DNA evidence. Users can register, view, update and delete DNA samples. Each role only sees the samples it is allowed to see.

## Files changed

| File | Type | What changed |
|---|---|---|
| `database/sql/dna_samples.sql` | New | Raw SQL: the table and every query, tested in MySQL first |
| `database/schema.sql` | Modified | Added the `dna_samples` table |
| `database/seed.sql` | Modified | Added 6 demo DNA samples |
| `backend/models/dnaSampleModel.js` | New | Runs the raw SQL through `mysql2` |
| `backend/controllers/dnaSampleController.js` | New | Validates requests, checks access, shapes responses |
| `backend/routes/dnaSampleRoutes.js` | New | Endpoints plus `requireAuth` / `requireRole` guards |
| `backend/server.js` | Modified | Mounted `/api/dna-samples` |
| `frontend/src/services/dnaService.js` | Rewritten | Real sample API calls; matches stay mock until Phase 4 |
| `frontend/src/pages/Laboratory.jsx` | Modified | `Samples`, `SampleForm`, `SampleDetails` now use the real API |
| `frontend/src/components/SamplesTable.jsx` | Modified | Removed the "(Sample data)" mock label |
| `frontend/src/routes/AppRoutes.jsx` | Modified | Admin can register samples; added the edit route |

## Access rules

| Role | View | Register / Edit / Delete |
|---|---|---|
| Admin | All samples | Yes, any sample |
| Officer | Only samples of missing persons in **their assigned cases** (`case_files.officer_id`) | Yes, only for their assigned cases |
| Lab Technician | Only samples assigned to **their laboratory** | No (analysis update comes in Phase 3) |

A sample outside the user's scope returns **404 Not Found**, not 403. This way the API doesn't reveal that the sample exists.

## API endpoints

| Method | Endpoint | Roles | Purpose |
|---|---|---|---|
| GET | `/api/dna-samples` | Admin, Officer, Lab Technician | List samples (scoped). Filters: `search`, `status`, `person_id`, `family_id`, `lab_id`, `case_id` |
| GET | `/api/dna-samples/:id` | Admin, Officer, Lab Technician | One sample's details (scoped) |
| POST | `/api/dna-samples` | Admin, Officer | Register a sample |
| PUT | `/api/dna-samples/:id` | Admin, Officer | Update collection info (partial update allowed) |
| DELETE | `/api/dna-samples/:id` | Admin, Officer | Delete a sample |

## Design decisions

- **`family_id` decides the sample source.** When `family_id` is NULL, the sample belongs to the missing person or is evidence (hair, bone, personal belonging). When it's set, the sample is a **family reference sample**. Phase 4 matching compares these two kinds.
- **New samples always start as `Awaiting Analysis`.** Allowed statuses are `Awaiting Analysis`, `In Analysis`, `Analyzed` and `Rejected`.
- **Update does not touch analysis fields.** `dna_profile_code`, `analysis_date` and `status` belong to the lab technician (Phase 3).
- **Foreign key behaviour:**
  - `person_id` → `missing_persons`: `ON DELETE CASCADE`. Deleting a person deletes their samples.
  - `family_id` → `family_members`: `ON DELETE CASCADE`. Removing a family member removes their reference sample.
  - `lab_id` → `dna_labs`: `ON DELETE RESTRICT`. A lab with samples can't be deleted. `dnaLabController` already shows a message for this.
  - `technician_id` → `lab_technicians`: `ON DELETE RESTRICT`. `labTechnicianController` already shows a message for this.
- **Validation before saving:**
  - the person exists;
  - the family member belongs to that person;
  - the lab exists;
  - the technician works in that lab;
  - an Officer is assigned to that person's case;
  - the collection date is a real date and not in the future.

---

## 1.1 `database/sql/dna_samples.sql` (new)

Every query was written and tested here as raw SQL before it went into the backend model. What the file contains:

| Section | What it does |
|---|---|
| 0. `CREATE TABLE dna_samples` | Table with all required fields plus 4 foreign keys |
| 1. INSERT | Registers a sample. `SET @new_sample_id = LAST_INSERT_ID()` stores the new id so the test queries below only touch this row and leave the seed data alone |
| 2. Admin view | `INNER JOIN missing_persons` (every sample has a person) plus `LEFT JOIN` family, lab, technician and case (these may be missing) |
| 3. Officer view | `INNER JOIN case_files ... WHERE cf.officer_id = ?`, so only the officer's own cases |
| 4. Technician view | `WHERE s.lab_id IN (SELECT lab_id FROM lab_technicians WHERE user_id = ? OR technician_id = ?)`, so only the technician's own lab |
| 5. Details | One sample with all joined names |
| 6. UPDATE | Collection info only |
| 7. DELETE | Removes the test row |
| 8. Validation helpers | Family belongs to person / technician belongs to lab / officer assigned to person |

```sql
-- =========================================================
-- ForenTrace: DNA Sample Management Queries (Member 1 - Issue 1)
-- File: database/sql/dna_samples.sql
-- Ei file-er shob query age MySQL-e test kora hoyeche, tarpor
-- backend/models/dnaSampleModel.js e mysql2 diye use kora hoyeche.
-- =========================================================

USE forentrace_db;

-- 0. Table: dna_samples
-- Relationship:
--   MissingPerson 1 : M DNASample  (je missing person er jonno sample collect hoyeche)
--   FamilyMember  1 : M DNASample  (family reference sample hole family_id thakbe, noile NULL)
--   DNALab        1 : M DNASample  (kon lab e sample ta analysis hobe)
--   LabTechnician 1 : M DNASample  (kon technician sample ta handle korbe)
CREATE TABLE IF NOT EXISTS dna_samples (
    sample_id INT AUTO_INCREMENT PRIMARY KEY,
    person_id INT NOT NULL,                 -- FK: missing_persons (ei sample kon investigation er)
    family_id INT NULL,                     -- FK: family_members (NULL mane missing person/evidence er nijer sample)
    lab_id INT NULL,                        -- FK: dna_labs (assigned laboratory)
    technician_id INT NULL,                 -- FK: lab_technicians (assigned technician, optional)
    sample_type VARCHAR(100) NOT NULL,      -- Buccal Swab, Blood Sample, Hair Strand, Bone Sample etc.
    collection_date DATE NOT NULL,          -- kobe sample collect kora hoyeche
    storage_location VARCHAR(150) NULL,     -- evidence room / freezer location
    remarks TEXT NULL,                      -- collection / laboratory remarks
    analysis_date DATE NULL,                -- lab analysis shesh howar date (technician set korbe)
    dna_profile_code VARCHAR(100) NULL,     -- analysis er por generated DNA profile code
    status VARCHAR(30) NOT NULL DEFAULT 'Awaiting Analysis', -- Awaiting Analysis / In Analysis / Analyzed / Rejected
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Missing person delete hole tar shob sample o delete hoye jabe
    CONSTRAINT fk_sample_person
        FOREIGN KEY (person_id) REFERENCES missing_persons(person_id)
        ON DELETE CASCADE,

    -- Family member remove hole tar reference sample o remove hobe
    CONSTRAINT fk_sample_family
        FOREIGN KEY (family_id) REFERENCES family_members(family_id)
        ON DELETE CASCADE,

    -- Sample assigned thakle lab delete kora jabe na (RESTRICT)
    CONSTRAINT fk_sample_lab
        FOREIGN KEY (lab_id) REFERENCES dna_labs(lab_id)
        ON DELETE RESTRICT,

    -- Sample assigned thakle technician delete kora jabe na (RESTRICT)
    CONSTRAINT fk_sample_technician
        FOREIGN KEY (technician_id) REFERENCES lab_technicians(technician_id)
        ON DELETE RESTRICT
);


-- 1. Register DNA Sample (INSERT)
-- Notun sample shob somoy 'Awaiting Analysis' status diye shuru hoy.
INSERT INTO dna_samples (
    person_id, family_id, lab_id, technician_id,
    sample_type, collection_date, storage_location, remarks, status
) VALUES (
    1, NULL, 1, 1,
    'Hair Strand', '2026-02-25', 'Evidence Room A-05',
    'Hair strand collected from personal hairbrush', 'Awaiting Analysis'
);

-- Notun insert howa sample er id variable e rakhlam, jate niche test query gulo seed data nosto na kore
SET @new_sample_id = LAST_INSERT_ID();


-- 2. View All DNA Samples with related info (Admin view)
-- INNER JOIN missing_persons: proti sample obosshoi ekta missing person er.
-- LEFT JOIN baki gulo: family / lab / technician / case na thakleo sample dekhabe.
SELECT
    s.sample_id,
    s.person_id,
    CONCAT(mp.first_name, ' ', mp.last_name) AS person_name,
    s.family_id,
    CONCAT(fm.first_name, ' ', fm.last_name) AS family_member_name,
    fm.relationship AS family_relationship,
    s.lab_id,
    dl.lab_name,
    s.technician_id,
    CONCAT(lt.first_name, ' ', lt.last_name) AS technician_name,
    cf.case_id,
    s.sample_type,
    s.collection_date,
    s.storage_location,
    s.analysis_date,
    s.dna_profile_code,
    s.status
FROM dna_samples s
INNER JOIN missing_persons mp ON s.person_id = mp.person_id
LEFT JOIN family_members fm ON s.family_id = fm.family_id
LEFT JOIN dna_labs dl ON s.lab_id = dl.lab_id
LEFT JOIN lab_technicians lt ON s.technician_id = lt.technician_id
LEFT JOIN case_files cf ON cf.person_id = s.person_id
ORDER BY s.sample_id DESC;


-- 3. Officer view: shudhu nijer assigned case er samples (officer_id = 1)
-- case_files.officer_id diye filter kora hocche.
SELECT
    s.sample_id,
    CONCAT(mp.first_name, ' ', mp.last_name) AS person_name,
    cf.case_id,
    s.sample_type,
    s.collection_date,
    s.status
FROM dna_samples s
INNER JOIN missing_persons mp ON s.person_id = mp.person_id
INNER JOIN case_files cf ON cf.person_id = s.person_id
WHERE cf.officer_id = 1
ORDER BY s.sample_id DESC;


-- 4. Lab Technician view: shudhu nijer laboratory te assigned samples
-- Logged-in user_id (ba technician_id) theke technician er lab_id ber kore filter kora hocche.
SELECT
    s.sample_id,
    CONCAT(mp.first_name, ' ', mp.last_name) AS person_name,
    dl.lab_name,
    s.sample_type,
    s.collection_date,
    s.status
FROM dna_samples s
INNER JOIN missing_persons mp ON s.person_id = mp.person_id
LEFT JOIN dna_labs dl ON s.lab_id = dl.lab_id
WHERE s.lab_id IN (
    SELECT lt.lab_id
    FROM lab_technicians lt
    WHERE lt.user_id = 2 OR lt.technician_id = 1
)
ORDER BY s.sample_id DESC;


-- 5. View single DNA Sample details (upore insert kora sample)
SELECT
    s.*,
    CONCAT(mp.first_name, ' ', mp.last_name) AS person_name,
    CONCAT(fm.first_name, ' ', fm.last_name) AS family_member_name,
    fm.relationship AS family_relationship,
    dl.lab_name,
    CONCAT(lt.first_name, ' ', lt.last_name) AS technician_name,
    cf.case_id
FROM dna_samples s
INNER JOIN missing_persons mp ON s.person_id = mp.person_id
LEFT JOIN family_members fm ON s.family_id = fm.family_id
LEFT JOIN dna_labs dl ON s.lab_id = dl.lab_id
LEFT JOIN lab_technicians lt ON s.technician_id = lt.technician_id
LEFT JOIN case_files cf ON cf.person_id = s.person_id
WHERE s.sample_id = @new_sample_id;


-- 6. Update DNA Sample collection information (UPDATE)
-- Ekhane shudhu collection/investigation info update hoy.
-- Analysis info (profile code, analysis date, status) Lab Technician update korbe (Issue 3).
UPDATE dna_samples
SET
    person_id = 1,
    family_id = NULL,
    lab_id = 1,
    technician_id = 2,
    sample_type = 'Hair Strand',
    collection_date = '2026-02-25',
    storage_location = 'Evidence Room A-06',
    remarks = 'Moved to a new evidence shelf'
WHERE sample_id = @new_sample_id;


-- 7. Delete DNA Sample (DELETE)
DELETE FROM dna_samples
WHERE sample_id = @new_sample_id;


-- 8. Validation helper queries (controller e register/update er age check kora hoy)
-- 8a. Family member ki ei missing person er? (family_id = 1, person_id = 1)
SELECT family_id FROM family_members WHERE family_id = 1 AND person_id = 1 LIMIT 1;

-- 8b. Technician ki selected lab er? (technician_id = 1, lab_id = 1)
SELECT technician_id FROM lab_technicians WHERE technician_id = 1 AND lab_id = 1 LIMIT 1;

-- 8c. Officer ki ei missing person er case e assigned? (officer_id = 1, person_id = 1)
SELECT case_id FROM case_files WHERE officer_id = 1 AND person_id = 1 LIMIT 1;
```

## 1.2 `database/schema.sql` (modified: appended)

The same `CREATE TABLE` as above, added to the main schema so a fresh setup creates the table.

```sql
-- DNA Samples Table (Member 1 - Issue 1)
-- Raw SQL + query gulo: database/sql/dna_samples.sql
CREATE TABLE IF NOT EXISTS dna_samples (
    sample_id INT AUTO_INCREMENT PRIMARY KEY,
    person_id INT NOT NULL,                 -- FK: je missing person er investigation er sample
    family_id INT NULL,                     -- FK: family reference sample hole family_id, noile NULL
    lab_id INT NULL,                        -- FK: assigned DNA lab
    technician_id INT NULL,                 -- FK: assigned lab technician (optional)
    sample_type VARCHAR(100) NOT NULL,
    collection_date DATE NOT NULL,
    storage_location VARCHAR(150) NULL,
    remarks TEXT NULL,
    analysis_date DATE NULL,                -- technician analysis shesh korle set hobe
    dna_profile_code VARCHAR(100) NULL,     -- analysis er por DNA profile code
    status VARCHAR(30) NOT NULL DEFAULT 'Awaiting Analysis',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_sample_person
        FOREIGN KEY (person_id) REFERENCES missing_persons(person_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_sample_family
        FOREIGN KEY (family_id) REFERENCES family_members(family_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_sample_lab
        FOREIGN KEY (lab_id) REFERENCES dna_labs(lab_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_sample_technician
        FOREIGN KEY (technician_id) REFERENCES lab_technicians(technician_id)
        ON DELETE RESTRICT
);
```

## 1.3 `database/seed.sql` (modified: appended)

Six demo samples. They reuse existing seed data: persons 1–3, family members 1–3, labs 1–3 and technicians 1–4.

| sample_id | Person | Source | Status |
|---|---|---|---|
| 1 | John Doe | Evidence (toothbrush) | Analyzed |
| 2 | John Doe | Family: father Rafiqul | Analyzed |
| 3 | John Doe | Family: mother Salma | Awaiting Analysis |
| 4 | Jane Smith | Family: brother Tanvir | Awaiting Analysis |
| 5 | Jane Smith | Evidence (hair strand) | Analyzed |
| 6 | Rahim Uddin | Evidence (bone) | Analyzed |

`ON DUPLICATE KEY UPDATE` means running the seed twice will not fail.

```sql
-- Seed Data for dna_samples (Member 1 - Issue 1)
-- family_id NULL = missing person/evidence sample, family_id thakle = family reference sample
INSERT INTO dna_samples (
    sample_id, person_id, family_id, lab_id, technician_id, sample_type, collection_date,
    storage_location, remarks, analysis_date, dna_profile_code, status
) VALUES
(1, 1, NULL, 1, 1, 'Personal Belonging', '2026-02-20', 'Evidence Room A-03', 'Toothbrush collected from residence', '2026-02-28', 'DNA7F2A91C4', 'Analyzed'),
(2, 1, 1, 1, 2, 'Buccal Swab', '2026-02-22', 'Cold Storage A-12', 'Reference sample from father', '2026-03-01', 'DNA7F2A91C9', 'Analyzed'),
(3, 1, 2, 1, NULL, 'Blood Sample', '2026-02-22', 'Cold Storage A-13', 'Reference sample from mother', NULL, NULL, 'Awaiting Analysis'),
(4, 2, 3, 2, 3, 'Buccal Swab', '2026-05-15', 'Freezer B-02', 'Reference sample from brother', NULL, NULL, 'Awaiting Analysis'),
(5, 2, NULL, 2, 3, 'Hair Strand', '2026-05-14', 'Evidence Room B-04', 'Hair strand from hostel room', '2026-05-20', 'DNA8C114A90', 'Analyzed'),
(6, 3, NULL, 3, 4, 'Bone Sample', '2026-01-25', 'Evidence Room C-01', 'Recovered remains sample', '2026-02-02', 'DNA5B7E20D1', 'Analyzed')
ON DUPLICATE KEY UPDATE sample_id = sample_id;
```

---

## 1.4 `backend/models/dnaSampleModel.js` (new)

The model only runs SQL, using `pool.execute` with `?` placeholders (this prevents SQL injection). No ORM or query builder is used.

| Function | What it does |
|---|---|
| `sampleSelect` | Reusable joined SELECT: sample + person name + family name/relationship + lab name + technician name + `case_id` |
| `scopeCondition(user)` | Builds the role-based `AND ...` SQL. Admin: nothing. Officer: `cf.officer_id = ?`. Technician: a lab subquery. Any other role: `AND 1 = 0` (no data) |
| `findAllSamples(filters, user)` | List with optional filters + search + scope, newest first |
| `findSampleById(id, user)` | One sample. Returns `null` if it doesn't exist **or** is out of scope |
| `createSample(data)` | INSERT with `status = 'Awaiting Analysis'`, then returns the joined row |
| `updateSampleById(id, data)` | UPDATE collection fields only |
| `deleteSampleById(id)` | DELETE and return `affectedRows` |
| `findPersonForSample`, `familyMemberBelongsToPerson`, `findLabForSample`, `technicianBelongsToLab`, `officerAssignedToPerson` | Small lookups the controller uses for validation |

```js
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
```

## 1.5 `backend/controllers/dnaSampleController.js` (new)

Follows the same pattern as `caseController.js`: `parseId`, `readField` (accepts both snake_case and camelCase), and a `{ success, ... }` response shape.

| Function | What it does |
|---|---|
| `SAMPLE_STATUSES` | Allowed status values |
| `formatDate` | Converts a MySQL `DATE` to `YYYY-MM-DD` using local date parts, so there's no timezone shift |
| `formatSample(row)` | Converts a DB row into the API object. Returns camelCase **and** snake_case keys so older components (`SamplesTable`) still work. Adds `source` based on `family_id` |
| `parseId`, `readField`, `normalizeText`, `normalizeOptionalText`, `normalizeOptionalId`, `normalizeDate` | Input cleaning helpers. `undefined` means invalid, `null` means empty/optional |
| `readSampleBody(body)` | Reads and validates every sample field. Returns `{ values }` or `{ error }` |
| `validateReferences(values, user)` | Checks the related records exist and belong together, and that an Officer is assigned to the case |
| `listSamples` | `GET /` — validates the status filter and passes `req.session.user` for scoping |
| `getSample` | `GET /:id` — 400 on a bad id, 404 when not found or out of scope |
| `createSample` | `POST /` — validate → check references → insert → 201 |
| `updateSample` | `PUT /:id` — loads the existing sample (scoped), **merges** the body into it (partial update), validates, saves |
| `deleteSample` | `DELETE /:id` — scoped existence check, then delete |

```js
import {
  findAllSamples,
  findSampleById,
  createSample as dbCreateSample,
  updateSampleById as dbUpdateSample,
  deleteSampleById as dbDeleteSample,
  findPersonForSample,
  familyMemberBelongsToPerson,
  findLabForSample,
  technicianBelongsToLab,
  officerAssignedToPerson,
} from '../models/dnaSampleModel.js'

// Sample er allowed status gulo (filter validate korar jonno)
export const SAMPLE_STATUSES = ['Awaiting Analysis', 'In Analysis', 'Analyzed', 'Rejected']

// Database er DATE ke frontend er YYYY-MM-DD format e convert kore
function formatDate(value) {
  if (!value) return null
  if (typeof value === 'string') return value.slice(0, 10)

  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Database row ke API response object e convert kore (camelCase + snake_case dutoi rakha holo
// jate purono component gulo (SamplesTable) o kaj kore)
export function formatSample(row) {
  if (!row) return null

  return {
    id: row.sample_id,
    sampleId: row.sample_id,
    sample_id: row.sample_id,
    personId: row.person_id,
    person_id: row.person_id,
    personName: row.person_name,
    personStatus: row.person_status,
    familyId: row.family_id,
    family_id: row.family_id,
    familyMemberName: row.family_member_name || null,
    familyRelationship: row.family_relationship || null,
    source: row.family_id ? 'Family Reference' : 'Missing Person / Evidence', // family_id thakle reference sample
    labId: row.lab_id,
    lab_id: row.lab_id,
    labName: row.lab_name || null,
    technicianId: row.technician_id,
    technician_id: row.technician_id,
    technicianName: row.technician_name || null,
    caseId: row.case_id ?? null,
    case_id: row.case_id ?? null,
    sampleType: row.sample_type,
    sample_type: row.sample_type,
    collectionDate: formatDate(row.collection_date),
    collection_date: formatDate(row.collection_date),
    storageLocation: row.storage_location || '',
    storage_location: row.storage_location || '',
    remarks: row.remarks || '',
    analysisDate: formatDate(row.analysis_date),
    analysis_date: formatDate(row.analysis_date),
    dnaProfileCode: row.dna_profile_code || null,
    dna_profile_code: row.dna_profile_code || null,
    status: row.status,
  }
}

// URL/body theke asha id valid positive integer kina check kore
function parseId(value) {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) return null
  return id
}

// Request body theke snake_case ba camelCase — je kono naam er field pora
function readField(body, ...names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(body, name)) {
      return { provided: true, value: body[name] }
    }
  }

  return { provided: false, value: undefined }
}

// Text trim kore, text na hole empty string dey
function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

// Optional text: faka hole null, text na hole undefined (invalid)
function normalizeOptionalText(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') return undefined
  return value.trim() || null
}

// Optional id: faka hole null, invalid hole undefined
function normalizeOptionalId(value) {
  if (value === null || value === undefined || value === '') return null
  return parseId(value) ?? undefined
}

// Date ta real kina ebong YYYY-MM-DD format e ache kina check
function normalizeDate(value) {
  if (typeof value !== 'string') return undefined

  const date = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined

  const parsed = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    return undefined
  }

  return date
}

// Body theke sample er collection fields pore validate kore — error thakle { error } return
function readSampleBody(body) {
  const personId = parseId(readField(body, 'person_id', 'personId').value)
  const familyId = normalizeOptionalId(readField(body, 'family_id', 'familyId').value)
  const labId = parseId(readField(body, 'lab_id', 'labId').value)
  const technicianId = normalizeOptionalId(readField(body, 'technician_id', 'technicianId').value)
  const sampleType = normalizeText(readField(body, 'sample_type', 'sampleType').value)
  const collectionDate = normalizeDate(readField(body, 'collection_date', 'collectionDate').value)
  const storageLocation = normalizeOptionalText(readField(body, 'storage_location', 'storageLocation').value)
  const remarks = normalizeOptionalText(readField(body, 'remarks').value)

  if (!personId || !labId || !sampleType) {
    return { error: 'Person ID, lab ID, sample type, and collection date are required.' }
  }

  if (familyId === undefined || technicianId === undefined) {
    return { error: 'Invalid family member or technician id.' }
  }

  if (!collectionDate) {
    return { error: 'Invalid collection date.' }
  }

  // Bhobishhot er collection date grohonjoggo na
  const today = formatDate(new Date())
  if (collectionDate > today) {
    return { error: 'Collection date cannot be in the future.' }
  }

  if (sampleType.length > 100 || (storageLocation && storageLocation.length > 150)) {
    return { error: 'Sample type or storage location is too long.' }
  }

  if (storageLocation === undefined || remarks === undefined) {
    return { error: 'Storage location and remarks must be text.' }
  }

  return {
    values: { personId, familyId, labId, technicianId, sampleType, collectionDate, storageLocation, remarks },
  }
}

// Related record gulo ache kina ebong eke oporer sathe mile kina check kore
async function validateReferences({ personId, familyId, labId, technicianId }, user) {
  if (!(await findPersonForSample(personId))) {
    return { status: 404, message: 'Missing person not found.' }
  }

  if (familyId && !(await familyMemberBelongsToPerson(familyId, personId))) {
    return { status: 400, message: 'Family member does not belong to the selected missing person.' }
  }

  if (!(await findLabForSample(labId))) {
    return { status: 404, message: 'DNA lab not found.' }
  }

  if (technicianId && !(await technicianBelongsToLab(technicianId, labId))) {
    return { status: 400, message: 'Technician does not belong to the selected DNA lab.' }
  }

  // Officer shudhu nijer assigned case er missing person er sample register/update korte parbe
  if (user.role === 'Officer' && !(await officerAssignedToPerson(user.officerId, personId))) {
    return { status: 403, message: 'You can only manage samples for your assigned cases.' }
  }

  return null
}

// GET /api/dna-samples — role onujayi scoped sample list
export async function listSamples(req, res) {
  try {
    const search = req.query.search?.trim() || req.query.q?.trim() || ''
    const status = req.query.status?.trim() || ''

    if (status && !SAMPLE_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid sample status filter.' })
    }

    const samples = await findAllSamples(
      {
        search: search || undefined,
        status: status || undefined,
        personId: parseId(req.query.person_id ?? req.query.personId) || undefined,
        familyId: parseId(req.query.family_id ?? req.query.familyId) || undefined,
        labId: parseId(req.query.lab_id ?? req.query.labId) || undefined,
        caseId: parseId(req.query.case_id ?? req.query.caseId) || undefined,
      },
      req.session.user // logged-in user er role diye scope hobe
    )

    return res.status(200).json({
      success: true,
      samples: samples.map(formatSample),
    })
  } catch (error) {
    console.error('List DNA samples error:', error)
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}

// GET /api/dna-samples/:id — ekta sample er details
export async function getSample(req, res) {
  try {
    const id = parseId(req.params.id)
    if (!id) {
      return res.status(400).json({ success: false, message: 'Invalid sample id.' })
    }

    // Scope er baire hole null ashbe → 404 (onno lab/case er sample ache kina o janano hobe na)
    const sample = await findSampleById(id, req.session.user)
    if (!sample) {
      return res.status(404).json({ success: false, message: 'DNA sample not found.' })
    }

    return res.status(200).json({ success: true, sample: formatSample(sample) })
  } catch (error) {
    console.error('Get DNA sample error:', error)
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}

// POST /api/dna-samples — notun DNA sample register
export async function createSample(req, res) {
  try {
    const { values, error } = readSampleBody(req.body || {})
    if (error) {
      return res.status(400).json({ success: false, message: error })
    }

    const referenceError = await validateReferences(values, req.session.user)
    if (referenceError) {
      return res.status(referenceError.status).json({ success: false, message: referenceError.message })
    }

    const sample = await dbCreateSample(values)

    return res.status(201).json({
      success: true,
      message: 'DNA sample registered successfully.',
      sample: formatSample(sample),
    })
  } catch (error) {
    console.error('Create DNA sample error:', error)
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}

// PUT /api/dna-samples/:id — sample er collection info update
export async function updateSample(req, res) {
  try {
    const id = parseId(req.params.id)
    if (!id) {
      return res.status(400).json({ success: false, message: 'Invalid sample id.' })
    }

    // Age dekhi user er ei sample access ache kina
    const existing = await findSampleById(id, req.session.user)
    if (!existing) {
      return res.status(404).json({ success: false, message: 'DNA sample not found.' })
    }

    // Body te je field deya hoyni sheta existing value theke nibo (partial update support)
    const body = req.body || {}
    const merged = {
      person_id: existing.person_id,
      family_id: existing.family_id,
      lab_id: existing.lab_id,
      technician_id: existing.technician_id,
      sample_type: existing.sample_type,
      collection_date: formatDate(existing.collection_date),
      storage_location: existing.storage_location,
      remarks: existing.remarks,
    }
    const fieldNames = {
      person_id: ['person_id', 'personId'],
      family_id: ['family_id', 'familyId'],
      lab_id: ['lab_id', 'labId'],
      technician_id: ['technician_id', 'technicianId'],
      sample_type: ['sample_type', 'sampleType'],
      collection_date: ['collection_date', 'collectionDate'],
      storage_location: ['storage_location', 'storageLocation'],
      remarks: ['remarks'],
    }
    for (const [key, names] of Object.entries(fieldNames)) {
      const field = readField(body, ...names)
      if (field.provided) merged[key] = field.value
    }

    const { values, error } = readSampleBody(merged)
    if (error) {
      return res.status(400).json({ success: false, message: error })
    }

    const referenceError = await validateReferences(values, req.session.user)
    if (referenceError) {
      return res.status(referenceError.status).json({ success: false, message: referenceError.message })
    }

    const sample = await dbUpdateSample(id, values)

    return res.status(200).json({
      success: true,
      message: 'DNA sample updated successfully.',
      sample: formatSample(sample),
    })
  } catch (error) {
    console.error('Update DNA sample error:', error)
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}

// DELETE /api/dna-samples/:id — sample delete
export async function deleteSample(req, res) {
  try {
    const id = parseId(req.params.id)
    if (!id) {
      return res.status(400).json({ success: false, message: 'Invalid sample id.' })
    }

    const existing = await findSampleById(id, req.session.user)
    if (!existing) {
      return res.status(404).json({ success: false, message: 'DNA sample not found.' })
    }

    await dbDeleteSample(id)

    return res.status(200).json({ success: true, message: 'DNA sample deleted successfully.' })
  } catch (error) {
    console.error('Delete DNA sample error:', error)
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}
```

## 1.6 `backend/routes/dnaSampleRoutes.js` (new)

Every route is protected. `requireAuth` means the user must be logged in. `requireRole(...)` means the user must have one of the listed roles. Reads are open to all three roles because the controller filters the data by role. Writes are Admin and Officer only.

```js
import express from 'express'

import {
  listSamples,
  getSample,
  createSample,
  updateSample,
  deleteSample,
} from '../controllers/dnaSampleController.js'
import { requireAuth } from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'

const router = express.Router()

// Admin, Officer, Lab Technician — tinjonei sample dekhte parbe (controller role onujayi data filter kore)
router.get('/', requireAuth, requireRole('Admin', 'Officer', 'Lab Technician'), listSamples)
router.get('/:id', requireAuth, requireRole('Admin', 'Officer', 'Lab Technician'), getSample)

// Shudhu Admin ar Officer sample register/update/delete korte parbe
// (Technician er analysis update Issue 3 e alada route e hobe)
router.post('/', requireAuth, requireRole('Admin', 'Officer'), createSample)
router.put('/:id', requireAuth, requireRole('Admin', 'Officer'), updateSample)
router.delete('/:id', requireAuth, requireRole('Admin', 'Officer'), deleteSample)

export default router
```

## 1.7 `backend/server.js` (modified)

Two lines added: import the router and mount it at `/api/dna-samples`.

```js
import dnaSampleRoutes from './routes/dnaSampleRoutes.js' // DNA Sample module (Member 1 - Issue 1)

app.use('/api/dna-samples', dnaSampleRoutes) // DNA sample CRUD endpoints
```

---

## 1.8 `frontend/src/services/dnaService.js` (rewritten)

Before this change, every function returned mock data (`USE_MOCK = true`). Now:

| Function | What it does |
|---|---|
| `getSamples(params)` | `GET /dna-samples` with filters |
| `getSampleById(id)` | `GET /dna-samples/:id` |
| `createSample(data)` / `updateSample(id, data)` / `deleteSample(id)` | Write operations |
| `getSamplesByPerson(personId)` | Used by the Missing Person Details → DNA Samples tab (now real data) |
| `getSamplesByCase(caseId)` | For Case Details (Member 2 can use this) |
| `getLabs()` / `getTechnicians()` | Dropdown data for the sample form |
| `getMatchesByPerson` / `getMatchesByCase` | **Still mock** (`USE_MOCK_MATCHES = true`) until Phase 4 |

It uses the shared axios `api` instance, which has `withCredentials: true`, so the session cookie is sent with each request.

```js
import api from './api'

// dnaService: DNA sample gulo ekhon real backend (/api/dna-samples) theke ashe.
// DNA match API Issue 4 e toiri hobe — totokkhon match gulo mock thakbe.
const USE_MOCK_MATCHES = true

// Match data ekhono mock kina (MatchesList e "(Sample data)" label dekhanor jonno)
export const isMockDna = () => USE_MOCK_MATCHES

function buildMatches(id) {
  const matchKey = id ?? 'ANY'
  const seed = Number(id) || 1
  const similarity = 70 + (seed * 7) % 30
  return [{
    match_id: `MOCK-M-${matchKey}-1`,
    unknown_sample_id: `MOCK-S-${matchKey}-1`,
    matched_sample_id: `MOCK-S-${matchKey}-2`,
    similarity_percentage: similarity,
    confidence_level: similarity >= 90 ? 'High' : similarity >= 80 ? 'Medium' : 'Low',
    match_date: '2026-09-01',
    match_status: 'Pending Review',
  }]
}

// ---------- DNA Samples (real API) ----------

// Sample list — params: { search, status, person_id, family_id, lab_id, case_id }
export async function getSamples(params = {}) {
  const response = await api.get('/dna-samples', { params })
  return response.data.samples ?? []
}

// Ekta sample er details
export async function getSampleById(id) {
  const response = await api.get(`/dna-samples/${id}`)
  return response.data.sample
}

// Notun sample register
export async function createSample(data) {
  const response = await api.post('/dna-samples', data)
  return response.data.sample
}

// Sample er collection info update
export async function updateSample(id, data) {
  const response = await api.put(`/dna-samples/${id}`, data)
  return response.data.sample
}

// Sample delete
export async function deleteSample(id) {
  const response = await api.delete(`/dna-samples/${id}`)
  return response.data
}

// Missing person details page er DNA Samples tab er jonno
export async function getSamplesByPerson(personId) {
  return getSamples({ person_id: personId })
}

// Case details page er DNA Samples section er jonno
export async function getSamplesByCase(caseId) {
  return getSamples({ case_id: caseId })
}

// ---------- Lab lookups (sample form er dropdown er jonno) ----------

// Shob DNA lab (GET /api/labs → { success, data })
export async function getLabs() {
  const response = await api.get('/labs')
  return response.data.data ?? []
}

// Shob lab technician (GET /api/technicians → { success, data })
export async function getTechnicians() {
  const response = await api.get('/technicians')
  return response.data.data ?? []
}

// ---------- DNA Matches (Issue 4 porjonto mock) ----------

export async function getMatchesByPerson(personId) {
  if (USE_MOCK_MATCHES) {
    return Promise.resolve(buildMatches(personId))
  }

  // TODO: Member 1 - Issue 4 e /api/dna-matches toiri hole connect hobe
  throw new Error('dnaService: dna matches API not implemented')
}

export async function getMatchesByCase(caseId) {
  if (USE_MOCK_MATCHES) {
    return Promise.resolve(buildMatches(caseId))
  }
  throw new Error('dnaService: dna matches API not implemented')
}

export default {
  isMockDna,
  getSamples,
  getSampleById,
  createSample,
  updateSample,
  deleteSample,
  getSamplesByPerson,
  getSamplesByCase,
  getLabs,
  getTechnicians,
  getMatchesByPerson,
  getMatchesByCase,
}
```

## 1.9 `frontend/src/pages/Laboratory.jsx` (modified: Phase 1 part)

The old `Samples`, `SampleForm` and `SampleDetails` read from the mock `DataContext` (localStorage). They now call the real API. `DNAAnalysis`, `Matches` and `MatchDetails` were **not changed yet** (Phases 3, 4 and 7).

| Part | What it does |
|---|---|
| Constants | `SAMPLE_STATUSES`, `SAMPLE_SOURCES`, `SAMPLE_TYPES`, `emptySampleForm` |
| `sampleProvider(sample)` | Shows "Family Name (Relationship)" for reference samples, otherwise the person's name |
| `toSamplePayload(form)` | Converts form strings into API numbers/nulls |
| `Samples()` | Loads the list from the API (respects `?personId=`), filters by search/status/source on the client, and shows **View / Analyze / Edit / Delete** buttons by role. Technicians see the case number as plain text, not a link |
| `SampleForm()` | One form for **register and edit** (edit mode when the URL has `:id`). Loads persons, labs and technicians. Loads family members when a person is chosen. Only shows technicians of the selected lab. Clears dependent dropdowns when the parent changes. Shows backend error messages |
| `SampleDetails()` | Loads one sample. The backend returns 404 when it's out of scope. Shows collection and analysis cards plus Edit/Delete (Admin/Officer) or Analyze (Technician) |

```jsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { PageHeader, SearchFilters, StatusBadge, TableAction } from '../components/Ui'
import { useData } from '../data/DataContext'
import { useAuth } from '../context/AuthContext'
import {
  createSample,
  deleteSample,
  getLabs,
  getSampleById,
  getSamples,
  getTechnicians,
  updateSample,
} from '../services/dnaService'
import { getMissingPersons } from '../services/missingPersonService'
import { getFamilyMembersByPerson } from '../services/familyMemberService'

const search = (row, query) => !query || Object.values(row).some(value => String(value ?? '').toLowerCase().includes(query.toLowerCase()))
const Field = ({ label, name, type = 'text', select, options = [], value, onChange, required }) => <div className="col-md-6"><label className="form-label">{label}</label>{select ? <select name={name} className="form-select" value={value} onChange={onChange} required={required}><option value="">Select {label}</option>{options.map(item => <option key={item.value ?? item} value={item.value ?? item}>{item.label ?? item}</option>)}</select> : <input name={name} type={type} className="form-control" value={value} onChange={onChange} required={required}/>}</div>
const sampleOwner = (sample, data) => sample.familyMemberId ? data.familyMembers.find(item => item.id === sample.familyMemberId)?.name || sample.person : sample.person
const technicianLab = (user, data) => user?.lab || data.technicians.find(item => item.email === user?.email || item.name === user?.name)?.lab || ''
const labCanAccessSample = (role, user, data, sample) => role !== 'Lab Technician' || sample.lab === technicianLab(user, data)

// ---------- DNA Sample module (real API — Member 1 Issue 1) ----------

const SAMPLE_STATUSES = ['Awaiting Analysis', 'In Analysis', 'Analyzed', 'Rejected'] // backend er SAMPLE_STATUSES er sathe mil
const SAMPLE_SOURCES = ['Missing Person / Evidence', 'Family Reference'] // family_id thakle Family Reference
const SAMPLE_TYPES = ['Buccal Swab', 'Blood Sample', 'Hair Strand', 'Bone Sample', 'Tissue Sample', 'Personal Belonging']
const errorMessage = (error, fallback) => error.response?.data?.message || fallback // backend er error message dekhano
const today = () => new Date().toISOString().slice(0, 10)
const emptySampleForm = { personId: '', familyId: '', labId: '', technicianId: '', sampleType: '', collectionDate: '', storageLocation: '', remarks: '' }

// Sample ta kar — family reference hole family member er naam + relationship, noile missing person
const sampleProvider = sample => sample.familyMemberName ? `${sample.familyMemberName} (${sample.familyRelationship})` : sample.personName

// Form er state ke backend er payload e convert kore (faka optional id → null)
function toSamplePayload(form) {
  return {
    personId: Number(form.personId),
    familyId: form.familyId ? Number(form.familyId) : null,
    labId: Number(form.labId),
    technicianId: form.technicianId ? Number(form.technicianId) : null,
    sampleType: form.sampleType,
    collectionDate: form.collectionDate,
    storageLocation: form.storageLocation.trim() || null,
    remarks: form.remarks.trim() || null,
  }
}

// DNA sample list page — backend role onujayi already filter kore pathay
export function Samples() {
  const { role } = useAuth()
  const [params] = useSearchParams()
  const linkedPerson = params.get('personId') || '' // missing person page theke ashle shudhu tar sample
  const [samples, setSamples] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState({ status: '', source: '' })

  // Backend theke sample list load kora
  const refreshSamples = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      setSamples(await getSamples(linkedPerson ? { person_id: linkedPerson } : {}))
    } catch (requestError) {
      setError(errorMessage(requestError, 'Failed to load DNA samples.'))
    } finally {
      setLoading(false)
    }
  }, [linkedPerson])

  useEffect(() => { refreshSamples() }, [refreshSamples])

  // Search + dropdown filter client side e apply kora
  const rows = useMemo(() => samples.filter(item =>
    search(item, query) &&
    (!filters.status || item.status === filters.status) &&
    (!filters.source || item.source === filters.source)
  ), [samples, query, filters])

  const remove = async sample => {
    if (!window.confirm(`Delete DNA sample #${sample.id}? This action cannot be undone.`)) return
    try {
      setDeletingId(sample.id)
      setError('')
      await deleteSample(sample.id)
      await refreshSamples()
    } catch (requestError) {
      setError(errorMessage(requestError, 'Failed to delete the DNA sample.'))
    } finally {
      setDeletingId(null)
    }
  }

  const canManage = role === 'Admin' || role === 'Officer' // register/edit/delete permission

  return (
    <>
      <PageHeader
        title="DNA Samples"
        subtitle={linkedPerson ? 'Samples linked to the selected missing person.' : role === 'Lab Technician' ? 'DNA sample records assigned to your laboratory.' : role === 'Officer' ? 'DNA samples for your assigned investigation cases.' : 'DNA sample collection and analysis records.'}
        action={canManage ? <Link to={`/dna-samples/new${linkedPerson ? `?personId=${linkedPerson}` : ''}`} className="btn btn-primary">Register DNA Sample</Link> : null}
      />
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      <SearchFilters onSearchChange={setQuery} onClear={() => setFilters({ status: '', source: '' })}>
        <Filter label="State" value={filters.status} values={SAMPLE_STATUSES} onChange={status => setFilters({ ...filters, status })}/>
        <Filter label="Source" value={filters.source} values={SAMPLE_SOURCES} onChange={source => setFilters({ ...filters, source })}/>
      </SearchFilters>
      <div className="card">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead><tr><th>Sample ID</th><th>Source</th><th>Sample Type</th><th>Person / Family</th><th>Case</th><th>Lab</th><th>Collection Date</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan="9" className="text-center text-secondary py-4">Loading DNA samples...</td></tr>}
              {!loading && rows.map(item => (
                <tr key={item.id}>
                  <td className="fw-semibold">#{item.id}</td>
                  <td>{item.source}</td>
                  <td>{item.sampleType}</td>
                  <td>{sampleProvider(item)}{item.familyMemberName && <small className="d-block text-secondary">for {item.personName}</small>}</td>
                  <td>{item.caseId ? (role === 'Lab Technician' ? `#${item.caseId}` : <Link to={`/cases/${item.caseId}`}>#{item.caseId}</Link>) : '—'}</td>
                  <td>{item.labName || '—'}</td>
                  <td>{item.collectionDate}</td>
                  <td><StatusBadge value={item.status}/></td>
                  <td className="text-nowrap">
                    <TableAction to={`/dna-samples/${item.id}`}/>
                    {role === 'Lab Technician' && item.status === 'Awaiting Analysis' && <Link className="btn btn-sm btn-primary ms-1" to={`/lab/analysis/${item.id}`}>Analyze</Link>}
                    {canManage && <Link className="btn btn-sm btn-outline-secondary ms-1" to={`/dna-samples/${item.id}/edit`}>Edit</Link>}
                    {canManage && <button type="button" className="btn btn-sm btn-outline-danger ms-1" disabled={deletingId === item.id} onClick={() => remove(item)}>{deletingId === item.id ? 'Deleting...' : 'Delete'}</button>}
                  </td>
                </tr>
              ))}
              {!loading && !rows.length && <tr><td colSpan="9" className="text-center text-secondary py-4">No matching samples found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

// Register + Edit dutoi ei form diye hoy (URL e :id thakle edit mode)
export function SampleForm() {
  const { id } = useParams()
  const editing = Boolean(id)
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [form, setForm] = useState({ ...emptySampleForm, personId: params.get('personId') || '', collectionDate: today() })
  const [lookups, setLookups] = useState({ people: [], labs: [], technicians: [] })
  const [familyMembers, setFamilyMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Dropdown er data (missing person, lab, technician) + edit mode e existing sample load
  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const [people, labs, technicians, sample] = await Promise.all([
          getMissingPersons(),
          getLabs(),
          getTechnicians(),
          editing ? getSampleById(id) : Promise.resolve(null),
        ])
        if (!mounted) return
        setLookups({ people, labs, technicians })
        if (sample) {
          // Existing sample er value diye form fill kora
          setForm({
            personId: String(sample.personId),
            familyId: sample.familyId ? String(sample.familyId) : '',
            labId: sample.labId ? String(sample.labId) : '',
            technicianId: sample.technicianId ? String(sample.technicianId) : '',
            sampleType: sample.sampleType,
            collectionDate: sample.collectionDate || '',
            storageLocation: sample.storageLocation || '',
            remarks: sample.remarks || '',
          })
        }
      } catch (requestError) {
        if (mounted) setError(errorMessage(requestError, 'Failed to load the sample form.'))
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [editing, id])

  // Missing person change hole shudhu tar family member gulo load hobe
  useEffect(() => {
    if (!form.personId) { setFamilyMembers([]); return }
    let mounted = true
    getFamilyMembersByPerson(form.personId)
      .then(rows => { if (mounted) setFamilyMembers(Array.isArray(rows) ? rows : []) })
      .catch(() => { if (mounted) setFamilyMembers([]) })
    return () => { mounted = false }
  }, [form.personId])

  const change = event => {
    const next = { ...form, [event.target.name]: event.target.value }
    if (event.target.name === 'personId') next.familyId = '' // person change hole purono family selection baad
    if (event.target.name === 'labId') next.technicianId = '' // lab change hole purono technician baad
    setForm(next)
  }

  const submit = async event => {
    event.preventDefault()
    try {
      setSaving(true)
      setError('')
      const payload = toSamplePayload(form)
      const saved = editing ? await updateSample(id, payload) : await createSample(payload)
      nav(`/dna-samples/${saved.id}`)
    } catch (requestError) {
      setError(errorMessage(requestError, 'Failed to save the DNA sample.'))
    } finally {
      setSaving(false)
    }
  }

  // Dropdown option gulo
  const personOptions = lookups.people.map(person => ({ value: String(person.id), label: `${person.id} — ${person.name}` }))
  const familyOptions = familyMembers.map(member => ({ value: String(member.family_id), label: `${member.first_name} ${member.last_name} (${member.relationship})` }))
  const labOptions = lookups.labs.map(lab => ({ value: String(lab.lab_id), label: lab.lab_name }))
  const technicianOptions = lookups.technicians
    .filter(tech => String(tech.lab_id) === form.labId) // shudhu selected lab er technician
    .map(tech => ({ value: String(tech.technician_id), label: `${tech.first_name} ${tech.last_name} — ${tech.designation}` }))

  if (loading) return <div className="card"><div className="card-body text-center text-secondary py-4">Loading sample form...</div></div>

  return (
    <>
      <PageHeader title={editing ? `Edit DNA Sample #${id}` : 'Register DNA Sample'} subtitle="Record the DNA provider, laboratory assignment, and collection details."/>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      <form className="card" onSubmit={submit}>
        <div className="card-body">
          <div className="row g-3">
            <Field label="Missing Person" name="personId" select required value={form.personId} onChange={change} options={personOptions}/>
            <div className="col-md-6">
              <label className="form-label">Family Member (reference sample)</label>
              <select name="familyId" className="form-select" value={form.familyId} onChange={change} disabled={!form.personId}>
                <option value="">None — missing person / evidence sample</option>
                {familyOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <Field label="DNA Lab" name="labId" select required value={form.labId} onChange={change} options={labOptions}/>
            <div className="col-md-6">
              <label className="form-label">Assigned Technician (optional)</label>
              <select name="technicianId" className="form-select" value={form.technicianId} onChange={change} disabled={!form.labId}>
                <option value="">Not assigned</option>
                {technicianOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <Field label="Sample Type" name="sampleType" select required value={form.sampleType} onChange={change} options={SAMPLE_TYPES.includes(form.sampleType) || !form.sampleType ? SAMPLE_TYPES : [form.sampleType, ...SAMPLE_TYPES]}/>
            <Field label="Collection Date" name="collectionDate" type="date" required value={form.collectionDate} onChange={change}/>
            <Field label="Storage Location" name="storageLocation" value={form.storageLocation} onChange={change}/>
            <div className="col-12"><label className="form-label">Collection Remarks</label><textarea name="remarks" value={form.remarks} onChange={change} className="form-control" rows="4"/></div>
          </div>
        </div>
        <div className="card-footer bg-white text-end">
          <Link to={editing ? `/dna-samples/${id}` : '/dna-samples'} className="btn btn-light me-2">Cancel</Link>
          <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : editing ? 'Save Changes' : 'Save DNA Sample'}</button>
        </div>
      </form>
    </>
  )
}

// Ekta sample er details page — backend scope er baire hole 404 dey
export function SampleDetails() {
  const { id } = useParams()
  const { role } = useAuth()
  const nav = useNavigate()
  const [sample, setSample] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    setLoading(true)
    getSampleById(id)
      .then(row => { if (mounted) setSample(row) })
      .catch(requestError => { if (mounted) setError(errorMessage(requestError, 'Failed to load the DNA sample.')) })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [id])

  const remove = async () => {
    if (!window.confirm(`Delete DNA sample #${sample.id}? This action cannot be undone.`)) return
    try {
      await deleteSample(sample.id)
      nav('/dna-samples')
    } catch (requestError) {
      setError(errorMessage(requestError, 'Failed to delete the DNA sample.'))
    }
  }

  if (loading) return <div className="card"><div className="card-body text-center text-secondary py-4">Loading DNA sample...</div></div>
  if (!sample) return <div className="alert alert-warning">{error || 'This DNA sample could not be found.'}</div>

  const canManage = role === 'Admin' || role === 'Officer'
  const isTechnician = role === 'Lab Technician' // technician investigation page e link pabe na

  return (
    <>
      <PageHeader
        title={`DNA Sample #${sample.id}`}
        subtitle="DNA sample record"
        action={<>
          {isTechnician && sample.status === 'Awaiting Analysis' && <Link className="btn btn-primary" to={`/lab/analysis/${sample.id}`}>Analyze Sample</Link>}
          {canManage && <Link className="btn btn-outline-secondary" to={`/dna-samples/${sample.id}/edit`}>Edit</Link>}
          {canManage && <button type="button" className="btn btn-outline-danger" onClick={remove}>Delete</button>}
        </>}
      />
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      <div className="row g-4">
        <div className="col-lg-6">
          <Card title="Collection and relationship information">
            <div className="detail-grid">
              <span>DNA source<b>{sample.source}</b></span>
              <span>Sample type<b>{sample.sampleType}</b></span>
              <span>Provider / owner<b>{sampleProvider(sample)}</b></span>
              <span>Missing person<b>{isTechnician ? sample.personName : <Link to={`/missing-persons/${sample.personId}`}>{sample.personName}</Link>}</b></span>
              <span>Family member<b>{sample.familyMemberName ? `${sample.familyMemberName} (${sample.familyRelationship})` : '—'}</b></span>
              <span>Related case<b>{sample.caseId ? (isTechnician ? `#${sample.caseId}` : <Link to={`/cases/${sample.caseId}`}>#{sample.caseId}</Link>) : '—'}</b></span>
              <span>Collection date<b>{sample.collectionDate}</b></span>
              <span>Storage location<b>{sample.storageLocation || '—'}</b></span>
              <span>Assigned laboratory<b>{sample.labName || '—'}</b></span>
              <span>Assigned technician<b>{sample.technicianName || '—'}</b></span>
            </div>
          </Card>
        </div>
        <div className="col-lg-6">
          <Card title="Analysis information">
            <div className="d-flex justify-content-between mb-3"><span>Current state</span><StatusBadge value={sample.status}/></div>
            <div className="detail-grid">
              <span>Analysis date<b>{sample.analysisDate || '—'}</b></span>
              <span>DNA profile code<b>{sample.dnaProfileCode || '—'}</b></span>
            </div>
            <hr/>
            <b>Remarks</b>
            <p className="mb-0 mt-1">{sample.remarks || '—'}</p>
          </Card>
        </div>
      </div>
    </>
  )
}
```

## 1.10 `frontend/src/components/SamplesTable.jsx` (modified)

Samples are real now, so the "(Sample data)" label and the `dnaService` import were removed.

```diff
 import React from 'react'
 import { StatusBadge } from './Ui'
-import dnaService from '../services/dnaService'

+// Sample gulo ekhon real API theke ashe, tai "(Sample data)" mock label ar lagbe na
 export default function SamplesTable({ samples = [] }) {
-  const mockLabel = dnaService.isMockDna() ? ' (Sample data)' : ''
   if (!samples || !samples.length) return <div className="alert alert-secondary">No DNA samples available.</div>
   ...
-      <div className="mb-2 small text-muted">DNA Samples{mockLabel}</div>
+      <div className="mb-2 small text-muted">DNA Samples</div>
```

## 1.11 `frontend/src/routes/AppRoutes.jsx` (modified)

Admin can now open the register form, and there is a new edit route. Both match the backend permissions.

```jsx
<Route
  path="dna-samples/new"
  element={
    <ProtectedRoute allowedRoles={['Admin', 'Officer']}>
      <SampleForm />
    </ProtectedRoute>
  }
/>

{/* DNA sample edit — backend er PUT /api/dna-samples/:id er motoi Admin + Officer */}
<Route
  path="dna-samples/:id/edit"
  element={
    <ProtectedRoute allowedRoles={['Admin', 'Officer']}>
      <SampleForm />
    </ProtectedRoute>
  }
/>
```

---

## Phase 1 testing

**SQL:** `schema.sql`, `seed.sql` and `dna_samples.sql` were run on local MySQL. Every query ran without errors. The test INSERT was updated and then deleted, and the seed rows were not touched.

**API:** tested with curl, logged in as Admin, Officer 1, Officer 2 and Technician 1 (lab 1):

| Test | Result |
|---|---|
| No login → `GET /dna-samples` | 401 Authentication required |
| Admin list | Samples 6,5,4,3,2,1 (all) |
| Officer 1 list (case 1 = John Doe) | 3,2,1 |
| Officer 2 list (case 2 = Jane Smith) | 5,4 |
| Technician 1 list (lab 1) | 3,2,1 |
| Filters: `person_id`, `status`, `search=Rafiqul`, `case_id` | Correct rows |
| Invalid status filter / non-numeric id | 400 |
| Officer 1 opens sample 4 (another officer's case) | 404 |
| Officer registers a sample for their own case | 201 |
| Officer registers a sample for someone else's case | 403 "You can only manage samples for your assigned cases." |
| Family member of a different person | 400 |
| Technician from a different lab | 400 |
| Future collection date / non-existent lab | 400 / 404 |
| Technician tries POST / PUT | 403 Access denied |
| Partial update (`storageLocation` only, `familyId: null`) | 200, other fields kept |
| Officer 2 edits/deletes Officer 1's sample | 404 |
| Delete, then GET again | 200, then 404 |

**Frontend:** `oxlint` found no issues and `vite build` succeeded. The pages were not clicked through in a browser.

## Known gaps after Phase 1 (fixed in later phases)

- The technician's **Analyze** button still opens the old mock `DNAAnalysis` page (Phase 3).
- The Matches pages and `getMatchesBy*` are still mock (Phase 4).
- Member 2's family "Register DNA" form saves status `Collected`, which isn't one of the allowed statuses (Phase 2).

---

# Phase 2 — Issue 2: Family DNA Reference Integration

## Goal

Family members can give DNA reference samples, and those samples are linked correctly:

```
Family Member ──(family_id)──> DNA Sample ──(person_id)──> Missing Person
```

This phase adds three things:

- family reference DNA registration, now validated and protected;
- the link between a family member and their DNA sample;
- family DNA information inside the Missing Person Details page.

**Dependency:** this uses Member 2's `family_members` table and module, which were already in the repo.

## Problems in the old code

The earlier family "Register DNA" feature was written before the `dna_samples` table existed. `familyMemberModel.createFamilyDnaSample` and `familyMemberController.registerDnaSampleFromFamily` had these problems:

- **No login required.** `POST /api/family-members/:id/register-dna` had no `requireAuth` or `requireRole`.
- **Invalid status.** Samples were saved with `status = 'Collected'`, which is not one of the allowed statuses.
- **No validation.** The lab could be empty, the technician could come from a different lab, and the date wasn't checked.
- **No officer check.** Any officer could add a sample to any case.
- **Nothing showed the result.** The Missing Person Details page never displayed which family members had given DNA.

## Files changed

| File | Type | What changed |
|---|---|---|
| `database/sql/dna_samples.sql` | Modified | New queries 9–13: family lookup, `INSERT ... SELECT` registration, family + samples LEFT JOIN, coverage summary |
| `backend/models/dnaSampleModel.js` | Modified | Added `findFamilyMemberForSample`, `createFamilySample`, `findFamilyDnaByPerson`, `findFamilyDnaSummary` |
| `backend/controllers/dnaSampleController.js` | Modified | Added `registerFamilySample`, `getFamilyDna` |
| `backend/routes/dnaSampleRoutes.js` | Modified | Added `GET /api/dna-samples/family/:personId` |
| `backend/routes/familyMemberRoutes.js` | Modified | `register-dna` now uses the new controller, with `requireAuth` + `requireRole('Admin','Officer')` |
| `backend/controllers/familyMemberController.js` | Modified | Removed the old `registerDnaSampleFromFamily` (replaced) |
| `backend/models/familyMemberModel.js` | Modified | Removed the old `createFamilyDnaSample` (replaced) |
| `frontend/src/services/dnaService.js` | Modified | Added `getFamilyDnaByPerson` |
| `frontend/src/components/FamilyDnaPanel.jsx` | New | "Family DNA References" panel |
| `frontend/src/components/FamilyMembersManager.jsx` | Modified | Fixed the DNA form and added the `onChanged` callback |
| `frontend/src/pages/MissingPersons.jsx` | Modified | Family tab: DNA registration enabled + `FamilyDnaPanel` |
| `frontend/src/pages/Laboratory.jsx` | Modified | `SampleForm` accepts `?familyId=` to preselect the family member |

## API endpoints

| Method | Endpoint | Roles | Purpose |
|---|---|---|---|
| POST | `/api/family-members/:id/register-dna` | Admin, Officer | Register a reference sample for a family member (same URL as before, now validated) |
| GET | `/api/dna-samples/family/:personId` | Admin, Officer | Family members of a missing person, their reference samples, and a summary |

Lab Technicians get 403 on both endpoints because they should not see family contact details.

## Design decisions

- **`person_id` always comes from the family member's record.** The SQL is `INSERT ... SELECT fm.person_id, fm.family_id ... FROM family_members fm WHERE fm.family_id = ?`. The controller also overwrites any `person_id` / `family_id` sent in the body. So a family sample can never be linked to the wrong missing person.
- **Same validation as Phase 1.** Registration reuses `readSampleBody` and `validateReferences`, so the lab must exist, the technician must belong to that lab, the date must be valid and not in the future, and an Officer must be assigned to the case.
- **The URL did not change.** The frontend `familyMemberService.registerFamilyDnaSample` still calls `/family-members/:id/register-dna`. Only the handler behind it changed.
- **LEFT JOIN in the family view.** Family members with no sample still appear, showing "No reference sample yet" and a **Register Sample** button.

---

## 2.1 `database/sql/dna_samples.sql` (modified: queries 9–13 added)

| Query | What it does |
|---|---|
| 9 | Finds a family member together with their `person_id` (used before registering) |
| 10 | **`INSERT ... SELECT`**: registers a reference sample and takes `person_id` from `family_members`. `@family_sample_id` stores the new id for cleanup |
| 11 | Family members + their samples + lab name, using `LEFT JOIN` so members without samples still appear |
| 12 | Coverage summary: `COUNT(DISTINCT fm.family_id)` gives total members, `COUNT(DISTINCT s.family_id)` gives members with a sample, and `SUM(CASE ...)` gives the analyzed count |
| 13 | Deletes the test row so the seed data is unchanged |

```sql
-- =========================================================
-- Family DNA Reference Integration (Member 1 - Issue 2)
-- Link: Family Member ──(family_id)──> DNA Sample ──(person_id)──> Missing Person
-- =========================================================

-- 9. Family member er info ber kora (register er age — family ache kina ar kon person er)
SELECT family_id, person_id, first_name, last_name, relationship
FROM family_members
WHERE family_id = 1
LIMIT 1;


-- 10. Register family reference DNA sample (INSERT ... SELECT)
-- person_id hat diye na diye family_members theke SELECT kore neya hocche,
-- tai family sample shob somoy thik missing person er sathe link hobe.
INSERT INTO dna_samples (
    person_id, family_id, lab_id, technician_id,
    sample_type, collection_date, storage_location, remarks, status
)
SELECT
    fm.person_id,               -- family member je missing person er, sample o tar
    fm.family_id,               -- family member er sathe sample link
    1,                          -- lab_id
    2,                          -- technician_id
    'Buccal Swab',
    '2026-03-05',
    'Cold Storage A-15',
    'Second reference sample from father',
    'Awaiting Analysis'
FROM family_members fm
WHERE fm.family_id = 1;

-- Test row er id rakhlam jate sheshe delete kora jay
SET @family_sample_id = LAST_INSERT_ID();


-- 11. Missing person er shob family member + tader DNA reference sample (Missing Person Details page)
-- LEFT JOIN dna_samples: jar sample nai shei family member o dekhabe (sample column gulo NULL ashbe)
SELECT
    fm.family_id,
    CONCAT(fm.first_name, ' ', fm.last_name) AS family_member_name,
    fm.relationship,
    fm.phone,
    s.sample_id,
    s.sample_type,
    s.collection_date,
    s.status AS sample_status,
    s.dna_profile_code,
    dl.lab_name
FROM family_members fm
LEFT JOIN dna_samples s ON s.family_id = fm.family_id
LEFT JOIN dna_labs dl ON dl.lab_id = s.lab_id
WHERE fm.person_id = 1
ORDER BY fm.family_id ASC, s.sample_id ASC;


-- 12. Family DNA coverage summary (ekta missing person er jonno)
-- Koto jon family member, koto jon sample diyeche, koto gula reference sample analyzed
SELECT
    COUNT(DISTINCT fm.family_id) AS total_family_members,
    COUNT(DISTINCT s.family_id) AS members_with_sample,
    COUNT(s.sample_id) AS total_reference_samples,
    SUM(CASE WHEN s.status = 'Analyzed' THEN 1 ELSE 0 END) AS analyzed_reference_samples
FROM family_members fm
LEFT JOIN dna_samples s ON s.family_id = fm.family_id
WHERE fm.person_id = 1;


-- 13. Test row delete (seed data jeno thik thake)
DELETE FROM dna_samples
WHERE sample_id = @family_sample_id;
```

## 2.2 `backend/models/dnaSampleModel.js` (modified: Phase 2 functions added)

| Function | What it does |
|---|---|
| `findFamilyMemberForSample(familyId)` | Returns the family member with their `person_id`, or `null` |
| `createFamilySample(familyId, values)` | Runs query 10 (`INSERT ... SELECT`). Returns `null` if nothing was inserted, otherwise the joined sample row |
| `findFamilyDnaByPerson(personId)` | Runs query 11 and returns flat rows (one row per member + sample pair) |
| `findFamilyDnaSummary(personId)` | Runs query 12 and returns one row of counts |

```js
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
```

## 2.3 `backend/controllers/dnaSampleController.js` (modified: Phase 2 functions added)

| Function | What it does |
|---|---|
| `registerFamilySample` | 1) checks the family id; 2) loads the family member (404 if missing); 3) merges the body with `person_id` / `family_id` **forced from the family record**; 4) `readSampleBody` validation; 5) `validateReferences` (lab, technician-in-lab, officer assigned); 6) inserts and returns 201 with a message naming the family member |
| `getFamilyDna` | 1) checks the person id (400) and that the person exists (404); 2) an Officer must be assigned to the case (403); 3) loads rows and the summary in parallel; 4) **groups** the flat LEFT JOIN rows by `family_id` into `{ familyId, name, relationship, phone, samples: [] }`. A row with `sample_id = NULL` means that member has no sample; 5) converts SQL count strings to numbers |

```js
// ---------- Family DNA Reference Integration (Member 1 - Issue 2) ----------

// POST /api/family-members/:id/register-dna — family member theke reference DNA sample register
// person_id ar family_id body theke na niye family member record theke neya hoy (vul link hobe na)
export async function registerFamilySample(req, res) {
  try {
    const familyId = parseId(req.params.id)
    if (!familyId) {
      return res.status(400).json({ success: false, message: 'Invalid family member id.' })
    }

    const member = await findFamilyMemberForSample(familyId)
    if (!member) {
      return res.status(404).json({ success: false, message: 'Family member not found.' })
    }

    // Body er baki field (lab, technician, type, date...) nibo, kintu person/family jor kore family record theke
    const { values, error } = readSampleBody({
      ...(req.body || {}),
      person_id: member.person_id,
      family_id: member.family_id,
    })
    if (error) {
      return res.status(400).json({ success: false, message: error })
    }

    // Lab/technician valid kina + Officer hole tar assigned case kina check
    const referenceError = await validateReferences(values, req.session.user)
    if (referenceError) {
      return res.status(referenceError.status).json({ success: false, message: referenceError.message })
    }

    const sample = await dbCreateFamilySample(familyId, values)

    return res.status(201).json({
      success: true,
      message: `Reference DNA sample registered for ${member.first_name} ${member.last_name}.`,
      sample: formatSample(sample),
    })
  } catch (error) {
    console.error('Register family DNA sample error:', error)
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}

// GET /api/dna-samples/family/:personId — missing person details page er family DNA info
export async function getFamilyDna(req, res) {
  try {
    const personId = parseId(req.params.personId)
    if (!personId) {
      return res.status(400).json({ success: false, message: 'Invalid person id.' })
    }

    if (!(await findPersonForSample(personId))) {
      return res.status(404).json({ success: false, message: 'Missing person not found.' })
    }

    // Officer shudhu nijer assigned case er family DNA info dekhte parbe
    const user = req.session.user
    if (user.role === 'Officer' && !(await officerAssignedToPerson(user.officerId, personId))) {
      return res.status(403).json({ success: false, message: 'You can only view family DNA for your assigned cases.' })
    }

    const [rows, summary] = await Promise.all([
      findFamilyDnaByPerson(personId),
      findFamilyDnaSummary(personId),
    ])

    // LEFT JOIN er flat row gulo ke family member onujayi group kora (ek member er onek sample thakte pare)
    const members = new Map()
    for (const row of rows) {
      if (!members.has(row.family_id)) {
        members.set(row.family_id, {
          familyId: row.family_id,
          name: row.family_member_name,
          relationship: row.relationship,
          phone: row.phone,
          samples: [],
        })
      }

      if (row.sample_id) { // sample_id NULL mane ei member er ekhono kono sample nai
        members.get(row.family_id).samples.push({
          sampleId: row.sample_id,
          sampleType: row.sample_type,
          collectionDate: formatDate(row.collection_date),
          status: row.sample_status,
          analysisDate: formatDate(row.analysis_date),
          dnaProfileCode: row.dna_profile_code || null,
          labName: row.lab_name || null,
        })
      }
    }

    return res.status(200).json({
      success: true,
      summary: {
        totalFamilyMembers: Number(summary.total_family_members),
        membersWithSample: Number(summary.members_with_sample),
        totalReferenceSamples: Number(summary.total_reference_samples),
        analyzedReferenceSamples: Number(summary.analyzed_reference_samples || 0), // SUM NULL hole 0
      },
      familyMembers: [...members.values()],
    })
  } catch (error) {
    console.error('Get family DNA error:', error)
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}
```

## 2.4 `backend/routes/dnaSampleRoutes.js` (modified)

`/family/:personId` is placed **before** `/:id`. Otherwise Express would treat the word `family` as a sample id.

```diff
@@ -6,14 +6,20 @@ import {
   createSample,
   updateSample,
   deleteSample,
+  getFamilyDna,
 } from '../controllers/dnaSampleController.js'
 import { requireAuth } from '../middleware/authMiddleware.js'
 import { requireRole } from '../middleware/roleMiddleware.js'
 
 const router = express.Router()
 
+// Missing person er family member + reference sample info (Issue 2)
+// '/:id' er AGE rakhte hobe, noile 'family' ke id hishebe dhorbe
+// Technician family er contact info dekhbe na, tai shudhu Admin + Officer
+router.get('/family/:personId', requireAuth, requireRole('Admin', 'Officer'), getFamilyDna)
+
 // Admin, Officer, Lab Technician — tinjonei sample dekhte parbe (controller role onujayi data filter kore)
-router.get('/', requireAuth, requireRole('Admin', 'Officer', 'Lab Technician'), listSamples)
+router.get('/',requireAuth, requireRole('Admin', 'Officer', 'Lab Technician'), listSamples)
 router.get('/:id', requireAuth, requireRole('Admin', 'Officer', 'Lab Technician'), getSample)
 
 // Shudhu Admin ar Officer sample register/update/delete korte parbe
```

## 2.5 `backend/routes/familyMemberRoutes.js` (modified)

The URL stays the same, but it now points to the validated `registerFamilySample` and is protected with `requireAuth` + `requireRole('Admin', 'Officer')`.

```diff
@@ -6,8 +6,11 @@ import {
     addFamilyMember,
     editFamilyMember,
     removeFamilyMember,
-    registerDnaSampleFromFamily,
 } from '../controllers/familyMemberController.js';
+// Family DNA registration ekhon DNA Sample module (Member 1 - Issue 2) handle kore — validation + auth shoho
+import { registerFamilySample } from '../controllers/dnaSampleController.js';
+import { requireAuth } from '../middleware/authMiddleware.js';
+import { requireRole } from '../middleware/roleMiddleware.js';
 
 const router = express.Router();
 
@@ -29,7 +32,8 @@ router.put('/:id', editFamilyMember);
 // Remove family member
 router.delete('/:id', removeFamilyMember);
 
-// Register DNA sample from family member
-router.post('/:id/register-dna', registerDnaSampleFromFamily);
+// Register DNA sample from family member (Member 1 - Issue 2)
+// Login lagbe, shudhu Admin/Officer; person_id family record theke ashe, status 'Awaiting Analysis'
+router.post('/:id/register-dna', requireAuth, requireRole('Admin', 'Officer'), registerFamilySample);
 
 export default router;
\ No newline at end of file
```

## 2.6 `backend/controllers/familyMemberController.js` and `backend/models/familyMemberModel.js` (modified: old code removed)

The old unvalidated functions were removed and replaced with a comment pointing to the new location. The rest of Member 2's family CRUD is unchanged. I checked that `GET /api/family-members/1` still works.

```diff
@@ -5,7 +5,6 @@ import {
     createFamilyMember,
     updateFamilyMemberById,
     deleteFamilyMemberById,
-    createFamilyDnaSample,
 } from '../models/familyMemberModel.js';
 
 export async function listFamilyMembers(req, res) {
@@ -97,25 +96,4 @@ export async function removeFamilyMember(req, res) {
     }
 }
 
-export async function registerDnaSampleFromFamily(req, res) {
-    try {
-        const { id } = req.params;
-        const existing = await findFamilyMemberById(id);
-
-        if (!existing) {
-            return res.status(404).json({ message: 'Family member not found' });
-        }
-
-        const sample = await createFamilyDnaSample(id, req.body);
-        res.status(201).json({
-            message: 'Family reference DNA sample registered successfully',
-            data: sample,
-        });
-    } catch (error) {
-        console.error('Error registering family DNA sample:', error);
-        res.status(500).json({
-            message: 'Failed to register DNA sample. Ensure dna_samples table is created by Member 1.',
-            error: error.message,
-        });
-    }
-}
\ No newline at end of file
+// Family DNA sample registration dnaSampleController.registerFamilySample e move kora hoyeche (Member 1 - Issue 2)
\ No newline at end of file
```

```diff
@@ -157,46 +157,4 @@ export async function deleteFamilyMemberById(id) {
     return result.affectedRows;
 }
 
-export async function createFamilyDnaSample(familyId, sampleData) {
-    const member = await findFamilyMemberById(familyId);
-    if (!member) return null;
-
-    const {
-        lab_id = null,
-        technician_id = null,
-        sample_type = 'Buccal Swab (Family Reference)',
-        collection_date = new Date().toISOString().split('T')[0],
-        storage_location = null,
-        remarks = `Reference DNA sample from family member (${member.first_name} ${member.last_name})`,
-        status = 'Collected',
-    } = sampleData;
-
-    const [result] = await db.query(
-        `INSERT INTO dna_samples (
-      person_id, family_id, lab_id, technician_id,
-      sample_type, collection_date, storage_location, remarks, status
-    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
-        [
-            member.person_id,
-            familyId,
-            lab_id,
-            technician_id,
-            sample_type,
-            collection_date,
-            storage_location,
-            remarks,
-            status,
-        ]
-    );
-
-    return {
-        sample_id: result.insertId,
-        person_id: member.person_id,
-        family_id: Number(familyId),
-        sample_type,
-        collection_date,
-        storage_location,
-        remarks,
-        status,
-    };
-}
\ No newline at end of file
+// Family DNA sample insert dnaSampleModel.createFamilySample e move kora hoyeche (Member 1 - Issue 2)
\ No newline at end of file
```

---

## 2.7 `frontend/src/services/dnaService.js` (modified)

Added `getFamilyDnaByPerson(personId)`, which returns `{ summary, familyMembers }`.

```diff
@@ -64,6 +64,16 @@ export async function getSamplesByCase(caseId) {
   return getSamples({ case_id: caseId })
 }
 
+// Missing person er family member + tader reference DNA sample (Issue 2)
+// Response: { summary: {...}, familyMembers: [{ familyId, name, relationship, phone, samples: [...] }] }
+export async function getFamilyDnaByPerson(personId) {
+  const response = await api.get(`/dna-samples/family/${personId}`)
+  return {
+    summary: response.data.summary,
+    familyMembers: response.data.familyMembers ?? [],
+  }
+}
+
 // ---------- Lab lookups (sample form er dropdown er jonno) ----------
 
 // Shob DNA lab (GET /api/labs → { success, data })
@@ -105,6 +115,7 @@ export default {
   deleteSample,
   getSamplesByPerson,
   getSamplesByCase,
+  getFamilyDnaByPerson,
   getLabs,
   getTechnicians,
   getMatchesByPerson,
```

## 2.8 `frontend/src/components/FamilyDnaPanel.jsx` (new)

A "Family DNA References" card shown on the missing person's Family tab.

| Part | What it does |
|---|---|
| Props | `personId`: whose family to show. `refreshKey`: when this number changes, the data reloads |
| `useEffect` | Calls `getFamilyDnaByPerson` and uses a `mounted` flag so state isn't set after the component unmounts |
| Summary line | Family members / members with a reference sample / reference samples / analyzed |
| Table | One row per sample (a member with 2 samples gets 2 rows, and the name only shows on the first). Each sample id links to `/dna-samples/:id`. Status is shown with `StatusBadge` |
| No-sample row | "No reference sample yet" + a **Register Sample** button linking to `/dna-samples/new?personId=X&familyId=Y` |

```jsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { StatusBadge } from './Ui'
import { getFamilyDnaByPerson } from '../services/dnaService'

// Missing person details page e family DNA reference info dekhay (Member 1 - Issue 2)
// Family Member ──> DNA Sample ──> Missing Person link ta ekhane visible hoy
// refreshKey change hole data abar load hoy (family add/remove ba DNA register er por)
export default function FamilyDnaPanel({ personId, refreshKey = 0 }) {
  const [data, setData] = useState({ summary: null, familyMembers: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!personId) return
    let mounted = true
    setLoading(true)
    setError('')
    getFamilyDnaByPerson(personId)
      .then(result => { if (mounted) setData(result) })
      .catch(requestError => { if (mounted) setError(requestError.response?.data?.message || 'Failed to load family DNA information.') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [personId, refreshKey])

  const { summary, familyMembers } = data

  return (
    <div className="card mt-4">
      <div className="card-header bg-white"><strong>Family DNA References</strong></div>
      <div className="card-body">
        {loading && <div className="text-secondary">Loading family DNA information...</div>}
        {error && <div className="alert alert-danger mb-0">{error}</div>}

        {!loading && !error && summary && (
          <>
            {/* Summary: koto jon family member sample diyeche */}
            <div className="d-flex flex-wrap gap-3 mb-3 small">
              <span>Family members: <b>{summary.totalFamilyMembers}</b></span>
              <span>Members with reference sample: <b>{summary.membersWithSample}</b></span>
              <span>Reference samples: <b>{summary.totalReferenceSamples}</b></span>
              <span>Analyzed: <b>{summary.analyzedReferenceSamples}</b></span>
            </div>

            {!familyMembers.length ? (
              <div className="alert alert-secondary mb-0">No family members registered yet.</div>
            ) : (
              <div className="table-responsive">
                <table className="table table-sm align-middle mb-0">
                  <thead><tr><th>Family Member</th><th>Relationship</th><th>Sample</th><th>Type</th><th>Lab</th><th>Collected</th><th>DNA Profile</th><th>Status</th></tr></thead>
                  <tbody>
                    {familyMembers.map(member => member.samples.length ? (
                      // Ek member er ekadhik sample thakle proti sample alada row te
                      member.samples.map((sample, index) => (
                        <tr key={`${member.familyId}-${sample.sampleId}`}>
                          <td className="fw-semibold">{index === 0 ? member.name : ''}</td>
                          <td>{index === 0 ? member.relationship : ''}</td>
                          <td><Link to={`/dna-samples/${sample.sampleId}`}>#{sample.sampleId}</Link></td>
                          <td>{sample.sampleType}</td>
                          <td>{sample.labName || '—'}</td>
                          <td>{sample.collectionDate}</td>
                          <td>{sample.dnaProfileCode || '—'}</td>
                          <td><StatusBadge value={sample.status}/></td>
                        </tr>
                      ))
                    ) : (
                      // Sample nai — register korar shortcut link (form e person + family pre-selected thakbe)
                      <tr key={member.familyId}>
                        <td className="fw-semibold">{member.name}</td>
                        <td>{member.relationship}</td>
                        <td colSpan="5" className="text-secondary">No reference sample yet</td>
                        <td><Link className="btn btn-sm btn-outline-primary" to={`/dna-samples/new?personId=${personId}&familyId=${member.familyId}`}>Register Sample</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
```

## 2.9 `frontend/src/components/FamilyMembersManager.jsx` (modified)

| Change | Why |
|---|---|
| Removed `status: 'Collected'` from `initialDnaFormState` | The backend sets `Awaiting Analysis` |
| `sample_type` is a select (`FAMILY_SAMPLE_TYPES`) instead of free text | Keeps sample types consistent |
| DNA Lab is required, and changing it clears the technician | The backend requires a lab, and a technician must belong to that lab |
| The technician list only shows the selected lab's technicians, and is disabled until a lab is chosen | Stops a user from picking a technician from another lab |
| Collection Date is required | The backend requires a valid date |
| An empty technician is sent as `null` | The backend reads it as optional |
| The success message comes from the backend | Names the family member |
| New `onChanged` prop, called after add/edit/remove/register | Lets the parent refresh `FamilyDnaPanel` |

```diff
@@ -24,17 +24,22 @@ const initialFormState = {
   remarks: '',
 };
 
+// Family reference DNA form (Member 1 - Issue 2)
+// status pathano hoy na — backend shob notun sample 'Awaiting Analysis' diye shuru kore
 const initialDnaFormState = {
   lab_id: '',
   technician_id: '',
-  sample_type: 'Buccal Swab (Family Reference)',
+  sample_type: 'Buccal Swab',
   collection_date: new Date().toISOString().split('T')[0],
-  storage_location: 'Freezer-A1',
+  storage_location: '',
   remarks: '',
-  status: 'Collected',
 };
 
-export default function FamilyMembersManager({ personId = null, allowDnaRegistration = true }) {
+// Reference sample er jonno common sample type (DNA sample module er list er sathe mil)
+const FAMILY_SAMPLE_TYPES = ['Buccal Swab', 'Blood Sample', 'Hair Strand'];
+
+// onChanged: family add/edit/remove ba DNA register er por parent ke janay (FamilyDnaPanel refresh er jonno)
+export default function FamilyMembersManager({ personId = null, allowDnaRegistration = true, onChanged = () => {} }) {
   const navigate = useNavigate();
   const [members, setMembers] = useState([]);
   const [missingPersons, setMissingPersons] = useState([]);
@@ -170,6 +175,7 @@ export default function FamilyMembersManager({ personId = null, allowDnaRegistra
       setShowForm(false);
       setEditingId(null);
       fetchAllData();
+      onChanged(); // family DNA panel refresh
     } catch (err) {
       setError(err.response?.data?.message || err.message || 'Operation failed');
     }
@@ -184,6 +190,7 @@ export default function FamilyMembersManager({ personId = null, allowDnaRegistra
       await deleteFamilyMember(familyId);
       setSuccess('Family member removed successfully!');
       fetchAllData();
+      onChanged(); // family DNA panel refresh (member er sample o cascade e delete hoy)
     } catch (err) {
       setError(err.response?.data?.message || err.message || 'Failed to delete family member');
     }
@@ -206,9 +213,14 @@ export default function FamilyMembersManager({ personId = null, allowDnaRegistra
     setSuccess('');
 
     try {
-      await registerFamilyDnaSample(dnaTargetMember.family_id, dnaFormData);
-      setSuccess(`DNA Sample registered for ${dnaTargetMember.first_name} ${dnaTargetMember.last_name}!`);
+      // Faka technician '' na pathiye null pathai (backend optional id hishebe nibe)
+      const result = await registerFamilyDnaSample(dnaTargetMember.family_id, {
+        ...dnaFormData,
+        technician_id: dnaFormData.technician_id || null,
+      });
+      setSuccess(result.message || `DNA Sample registered for ${dnaTargetMember.first_name} ${dnaTargetMember.last_name}!`);
       setDnaTargetMember(null);
+      onChanged(); // notun reference sample panel e dekhabe
     } catch (err) {
       setError(err.response?.data?.message || err.message || 'Could not register DNA sample');
     }
@@ -455,21 +467,26 @@ export default function FamilyMembersManager({ personId = null, allowDnaRegistra
             <form onSubmit={handleRegisterDnaSubmit} className="row g-3">
               <div className="col-md-4">
                 <label className="form-label">Sample Type *</label>
-                <input
-                  type="text"
-                  className="form-control"
+                <select
+                  className="form-select"
                   value={dnaFormData.sample_type}
                   onChange={(e) => setDnaFormData({ ...dnaFormData, sample_type: e.target.value })}
                   required
-                />
+                >
+                  {FAMILY_SAMPLE_TYPES.map((type) => (
+                    <option key={type} value={type}>{type}</option>
+                  ))}
+                </select>
               </div>
 
               <div className="col-md-4">
-                <label className="form-label">Assign DNA Lab</label>
+                <label className="form-label">Assign DNA Lab *</label>
                 <select
                   className="form-select"
                   value={dnaFormData.lab_id}
-                  onChange={(e) => setDnaFormData({ ...dnaFormData, lab_id: e.target.value })}
+                  // Lab change hole purono technician baad (onno lab er technician assign atkano)
+                  onChange={(e) => setDnaFormData({ ...dnaFormData, lab_id: e.target.value, technician_id: '' })}
+                  required
                 >
                   <option value="">-- Select Lab --</option>
                   {labs.map((lab) => (
@@ -486,9 +503,11 @@ export default function FamilyMembersManager({ personId = null, allowDnaRegistra
                   className="form-select"
                   value={dnaFormData.technician_id}
                   onChange={(e) => setDnaFormData({ ...dnaFormData, technician_id: e.target.value })}
+                  disabled={!dnaFormData.lab_id}
                 >
-                  <option value="">-- Select Technician --</option>
-                  {technicians.map((tech) => (
+                  <option value="">-- Not assigned --</option>
+                  {/* Shudhu selected lab er technician dekhabe */}
+                  {technicians.filter((tech) => String(tech.lab_id) === String(dnaFormData.lab_id)).map((tech) => (
                     <option key={tech.technician_id} value={tech.technician_id}>
                       {tech.first_name} {tech.last_name}
                     </option>
@@ -497,12 +516,13 @@ export default function FamilyMembersManager({ personId = null, allowDnaRegistra
               </div>
 
               <div className="col-md-4">
-                <label className="form-label">Collection Date</label>
+                <label className="form-label">Collection Date *</label>
                 <input
                   type="date"
                   className="form-control"
                   value={dnaFormData.collection_date}
                   onChange={(e) => setDnaFormData({ ...dnaFormData, collection_date: e.target.value })}
+                  required
                 />
               </div>
 
```

## 2.10 `frontend/src/pages/MissingPersons.jsx` (modified)

On the Family Members tab of Missing Person Details:

- `allowDnaRegistration` is now on, so "Register DNA" works from this page;
- `FamilyDnaPanel` is shown under the family list;
- the `familyDnaRefresh` counter increases through `onChanged`, which makes the panel reload.

```diff
@@ -7,6 +7,7 @@ import dnaService from '../services/dnaService'
 import SamplesTable from '../components/SamplesTable'
 import MatchesList from '../components/MatchesList'
 import FamilyMembersManager from '../components/FamilyMembersManager'
+import FamilyDnaPanel from '../components/FamilyDnaPanel' // Family DNA reference info (Member 1 - Issue 2)
 import { useAuth } from '../context/AuthContext'
 
 const STATUSES = ['Missing', 'Identified']
@@ -290,6 +291,9 @@ export function MissingPersonDetails() {
   // Tabbed details (Overview, Case, Family Members, DNA Samples, DNA Matches)
   const [activeTab, setActiveTab] = useState('overview')
 
+  // Family member / DNA register change hole FamilyDnaPanel reload korar jonno counter (Member 1 - Issue 2)
+  const [familyDnaRefresh, setFamilyDnaRefresh] = useState(0)
+
   // Case tab state
   const [caseData, setCaseData] = useState(null)
   const [caseLoading, setCaseLoading] = useState(false)
@@ -473,7 +477,10 @@ export function MissingPersonDetails() {
                 {activeTab === 'family' && (
                   <div>
                     <h5 className="mb-2">Family Members</h5>
-                    <FamilyMembersManager personId={person.id} allowDnaRegistration={false} />
+                    {/* Family theke reference DNA register ekhon ekhan thekei kora jay (Issue 2) */}
+                    <FamilyMembersManager personId={person.id} allowDnaRegistration onChanged={() => setFamilyDnaRefresh(count => count + 1)} />
+                    {/* Kon family member sample diyeche, tar status/profile code */}
+                    <FamilyDnaPanel personId={person.id} refreshKey={familyDnaRefresh} />
                   </div>
                 )}
 
```

## 2.11 `frontend/src/pages/Laboratory.jsx` (modified)

`SampleForm` now also reads `?familyId=` from the URL. This makes the panel's "Register Sample" button open the form with both the person and the family member already selected. The family id isn't cleared on load, because it's only cleared when the user changes the person.

```diff
@@ -148,7 +148,8 @@ export function SampleForm() {
   const editing = Boolean(id)
   const nav = useNavigate()
   const [params] = useSearchParams()
-  const [form, setForm] = useState({ ...emptySampleForm, personId: params.get('personId') || '', collectionDate: today() })
+  // ?personId=&familyId= diye ashle (FamilyDnaPanel er "Register Sample") person + family pre-select thakbe
+  const [form, setForm] = useState({ ...emptySampleForm, personId: params.get('personId') || '', familyId: params.get('familyId') || '', collectionDate: today() })
   const [lookups, setLookups] = useState({ people: [], labs: [], technicians: [] })
   const [familyMembers, setFamilyMembers] = useState([])
   const [loading, setLoading] = useState(true)
```

---

## Phase 2 testing

**SQL:** queries 9–13 ran on local MySQL. The `INSERT ... SELECT` correctly took `person_id = 1` from family member 1. The LEFT JOIN returned members with and without samples. The summary returned 2 members, 2 with a sample, 1 analyzed. The test row was deleted.

**API:** tested with curl, logged in as Admin, Officer 1 (case 1 = John Doe), Officer 2 (case 2 = Jane Smith) and Technician 1:

| Test | Result |
|---|---|
| Register with no login | 401 (before Phase 2 this was allowed) |
| Admin `GET /dna-samples/family/1` | Summary {2 members, 2 with sample, 1 analyzed}; Rafiqul #2 Analyzed, Salma #3 Awaiting |
| Admin `GET /dna-samples/family/3` (no family) | Summary with zeros, empty list |
| Officer 1 → person 1 / person 2 | 200 / 403 "You can only view family DNA for your assigned cases." |
| Technician → family DNA | 403 Access denied |
| Unknown person / non-numeric id | 404 / 400 |
| Officer 1 registers a sample for family 1 | 201 "Reference DNA sample registered for Rafiqul Islam.", status Awaiting Analysis, source Family Reference |
| Body tries `personId: 2, familyId: 3` on family 1 | Ignored. The sample was linked to family 1 / person 1 |
| Officer 1 registers for family 3 (another officer's case) | 403 |
| Officer 2 registers for family 3 (own case) | 201 |
| Technician from another lab / no lab / unknown family | 400 / 400 / 404 |
| Technician tries to register | 403 |
| Family view after registering | Counts and sample lists updated |
| Member 2's `GET /family-members/1` | Still works |

The test samples and users were deleted afterwards.

**Frontend:** `oxlint` found no warnings in the new code. It reported 5 existing warnings in Member 2's lines that I didn't change. `vite build` succeeded. The pages were not clicked through in a browser.

## Known gaps after Phase 2

- The technician's **Analyze** button still opens the old mock `DNAAnalysis` page (Phase 3).
- The Matches pages are still mock (Phase 4).

---

# Phase 3 — Issue 3: Laboratory DNA Analysis Workflow

## Goal

Lab technicians can finish the DNA processing workflow. This phase adds:

- a real **Lab Sample Analysis page**;
- a **technician sample view** with lab queue counts;
- **DNA profile updates**.

A technician can update **only** these four fields:

| Field | Column |
|---|---|
| DNA profile code | `dna_profile_code` |
| Analysis date | `analysis_date` |
| Laboratory remarks | `remarks` |
| Analysis status | `status` |

A technician **cannot** change investigation information (missing person, family member, lab, sample type, collection date, storage location).

## Files changed

| File | Type | What changed |
|---|---|---|
| `database/sql/dna_samples.sql` | Modified | Queries 14–20: technician lookup, analysis queue, lab summary, analysis-only UPDATE |
| `backend/models/dnaSampleModel.js` | Modified | Added `findTechnicianForUser`, `findLabSampleSummary`, `updateSampleAnalysis` |
| `backend/controllers/dnaSampleController.js` | Modified | Added `updateAnalysis`, `getLabSummary` |
| `backend/routes/dnaSampleRoutes.js` | Modified | Added `PUT /:id/analysis` and `GET /lab/summary` (Lab Technician only) |
| `frontend/src/services/dnaService.js` | Modified | Added `updateSampleAnalysis`, `getLabSummary` |
| `frontend/src/pages/Laboratory.jsx` | Modified | Rewrote `DNAAnalysis` (real API), added lab queue cards to `Samples`, updated the Analyze buttons |

## API endpoints

| Method | Endpoint | Roles | Purpose |
|---|---|---|---|
| PUT | `/api/dna-samples/:id/analysis` | Lab Technician | Update only the analysis fields of a sample in the technician's own lab |
| GET | `/api/dna-samples/lab/summary` | Lab Technician | Sample counts by status for the technician's lab |

Admin and Officer get **403** on both endpoints. Admin and Officer still use `PUT /api/dna-samples/:id` for collection info, and that endpoint gives Technicians **403**. So the two update paths are fully separate.

## Analysis rules (enforced in the backend)

| Rule | Error |
|---|---|
| The body contains any investigation field (`personId`, `labId`, `sampleType`, `collectionDate`, ...) | 400 "Lab technicians can only update analysis fields ..." |
| No `lab_technicians` row is linked to the logged-in user | 403 "No technician profile is linked to this account." |
| The sample is not in the technician's lab | 404 (the query is scoped, and the UPDATE also has `AND lab_id = ?`) |
| `status` is not one of the allowed statuses | 400 |
| `Analyzed` without a profile code **and** an analysis date | 400 |
| Profile code is not 6–50 letters, numbers or hyphens | 400 (the code is saved in **UPPERCASE**) |
| Analysis date is in the future or before the collection date | 400 |
| `Rejected` without remarks (a reason) | 400 |

## Design decisions

- **Separate endpoint instead of role checks inside one PUT.** The route guard itself (`requireRole('Lab Technician')`) makes the "technician updates analysis only" rule clear.
- **Rejecting instead of ignoring.** If a technician sends investigation fields, the whole request fails with a clear message. This makes the rule visible instead of silently dropping data.
- **Auto-assign technician:** `technician_id = COALESCE(technician_id, ?)`. If no technician was assigned when the sample was registered, the technician who analyzes it is recorded. An existing assignment is never overwritten.
- **Checking the lab twice:** the sample lookup is scoped to the technician's lab, and the `UPDATE ... WHERE sample_id = ? AND lab_id = ?` checks the lab again in the database.
- **Technician lookup handles both links:** `lab_technicians.user_id = ?` **or** `lab_technicians.technician_id = users.technician_id`. The codebase uses both ways of linking a technician to a user.
- **Partial updates and corrections:** fields not sent keep their current value. Technicians can open **Update Analysis** on an already analyzed sample to fix mistakes.

---

## 3.1 `database/sql/dna_samples.sql` (modified: queries 14–20 added)

| Query | What it does |
|---|---|
| 14 | Finds the logged-in user's technician profile and lab (`user_id = ? OR technician_id = ?`) |
| 15 | Technician's analysis queue: own lab's samples in `Awaiting Analysis` / `In Analysis`, oldest first |
| 16 | Lab workload summary: `COUNT` + `SUM(CASE WHEN status = ...)` per status, with `LEFT JOIN` so a lab with 0 samples still returns a row |
| 17 | Inserts a test sample so the seed data isn't changed |
| 18 | **Analysis-only UPDATE**: sets profile code, date, remarks and status, uses `COALESCE` to auto-assign the technician, and has `AND lab_id = ?` as a lab guard |
| 19 | Checks the result |
| 20 | Deletes the test sample |

```sql
-- =========================================================
-- Laboratory DNA Analysis Workflow (Member 1 - Issue 3)
-- Technician shudhu analysis field update korte parbe:
--   dna_profile_code, analysis_date, remarks (laboratory remarks), status
-- Investigation info (person, family, lab, collection data) technician change korte parbe na.
-- =========================================================

-- 14. Logged-in user er technician profile + lab ber kora (user_id = 2 ba technician_id = 1)
SELECT lt.technician_id, lt.lab_id, dl.lab_name
FROM lab_technicians lt
INNER JOIN dna_labs dl ON dl.lab_id = lt.lab_id
WHERE lt.user_id = 2 OR lt.technician_id = 1
LIMIT 1;


-- 15. Technician er analysis queue: nijer lab er je sample gulo ekhono analysis baki
SELECT
    s.sample_id,
    s.sample_type,
    s.collection_date,
    s.status,
    CONCAT(lt.first_name, ' ', lt.last_name) AS technician_name
FROM dna_samples s
LEFT JOIN lab_technicians lt ON lt.technician_id = s.technician_id
WHERE s.lab_id = 1
  AND s.status IN ('Awaiting Analysis', 'In Analysis')
ORDER BY s.collection_date ASC;   -- purono sample age (first come first serve)


-- 16. Lab workload summary (technician er Samples page er card): status onujayi count
SELECT
    dl.lab_id,
    dl.lab_name,
    COUNT(s.sample_id) AS total_samples,
    SUM(CASE WHEN s.status = 'Awaiting Analysis' THEN 1 ELSE 0 END) AS awaiting_analysis,
    SUM(CASE WHEN s.status = 'In Analysis' THEN 1 ELSE 0 END) AS in_analysis,
    SUM(CASE WHEN s.status = 'Analyzed' THEN 1 ELSE 0 END) AS analyzed,
    SUM(CASE WHEN s.status = 'Rejected' THEN 1 ELSE 0 END) AS rejected
FROM dna_labs dl
LEFT JOIN dna_samples s ON s.lab_id = dl.lab_id
WHERE dl.lab_id = 1
GROUP BY dl.lab_id, dl.lab_name;


-- 17. Analysis test er jonno ekta test sample (seed data nosto na korar jonno)
INSERT INTO dna_samples (person_id, family_id, lab_id, technician_id, sample_type, collection_date, storage_location, status)
VALUES (1, NULL, 1, NULL, 'Hair Strand', '2026-03-02', 'Evidence Room A-07', 'Awaiting Analysis');
SET @analysis_sample_id = LAST_INSERT_ID();


-- 18. Technician analysis update (UPDATE — shudhu analysis column)
-- technician_id NULL thakle je technician analysis korlo take assign kora hoy (COALESCE)
-- WHERE e lab_id check: technician shudhu nijer lab er sample update korte parbe
UPDATE dna_samples
SET
    dna_profile_code = 'DNA7F2A91C5',
    analysis_date = '2026-03-06',
    remarks = 'STR profile generated successfully',
    status = 'Analyzed',
    technician_id = COALESCE(technician_id, 1)
WHERE sample_id = @analysis_sample_id
  AND lab_id = 1;


-- 19. Update er por result check
SELECT sample_id, person_id, lab_id, technician_id, dna_profile_code, analysis_date, remarks, status
FROM dna_samples
WHERE sample_id = @analysis_sample_id;


-- 20. Test sample delete
DELETE FROM dna_samples
WHERE sample_id = @analysis_sample_id;
```

## 3.2 `backend/models/dnaSampleModel.js` (modified: Phase 3 functions added)

| Function | What it does |
|---|---|
| `findTechnicianForUser(user)` | Runs query 14 using `session.userId` / `session.technicianId`. Returns `{ technician_id, lab_id, lab_name }` or `null` |
| `findLabSampleSummary(labId)` | Runs query 16 and returns one row of status counts |
| `updateSampleAnalysis(id, labId, technicianId, values)` | Runs query 18. Returns `null` if no row matched (wrong lab), otherwise the updated joined sample |

```js
// ---------- Laboratory DNA Analysis Workflow (Member 1 - Issue 3) ----------
// Query gulo database/sql/dna_samples.sql er 14-18 number section e test kora

// Logged-in technician er profile + lab ber kora (users.technician_id ba lab_technicians.user_id — je kono link diye)
export async function findTechnicianForUser(user) {
  const [rows] = await pool.execute(
    `
    SELECT lt.technician_id, lt.lab_id, dl.lab_name
    FROM lab_technicians lt
    INNER JOIN dna_labs dl ON dl.lab_id = lt.lab_id
    WHERE lt.user_id = ? OR lt.technician_id = ?
    LIMIT 1
    `,
    [user?.userId ?? 0, user?.technicianId ?? 0]
  )

  return rows[0] || null
}

// Technician er lab er workload summary — status onujayi koto sample
export async function findLabSampleSummary(labId) {
  const [rows] = await pool.execute(
    `
    SELECT
      dl.lab_id,
      dl.lab_name,
      COUNT(s.sample_id) AS total_samples,
      SUM(CASE WHEN s.status = 'Awaiting Analysis' THEN 1 ELSE 0 END) AS awaiting_analysis,
      SUM(CASE WHEN s.status = 'In Analysis' THEN 1 ELSE 0 END) AS in_analysis,
      SUM(CASE WHEN s.status = 'Analyzed' THEN 1 ELSE 0 END) AS analyzed,
      SUM(CASE WHEN s.status = 'Rejected' THEN 1 ELSE 0 END) AS rejected
    FROM dna_labs dl
    LEFT JOIN dna_samples s ON s.lab_id = dl.lab_id
    WHERE dl.lab_id = ?
    GROUP BY dl.lab_id, dl.lab_name
    `,
    [labId]
  )

  return rows[0] || null
}

// Technician analysis update — SHUDHU analysis column (profile code, analysis date, remarks, status)
// technician_id NULL thakle je technician analysis korlo take assign kora hoy (COALESCE)
// WHERE e lab_id: technician onno lab er sample update korte parbe na (database level e o protection)
export async function updateSampleAnalysis(id, labId, technicianId, {
  dnaProfileCode = null,
  analysisDate = null,
  remarks = null,
  status,
}) {
  const [result] = await pool.execute(
    `
    UPDATE dna_samples
    SET dna_profile_code = ?,
        analysis_date = ?,
        remarks = ?,
        status = ?,
        technician_id = COALESCE(technician_id, ?)
    WHERE sample_id = ?
      AND lab_id = ?
    `,
    [dnaProfileCode, analysisDate, remarks, status, technicianId, id, labId]
  )

  if (!result.affectedRows) return null
  return findSampleById(id)
}
```

## 3.3 `backend/controllers/dnaSampleController.js` (modified: Phase 3 functions added)

| Part | What it does |
|---|---|
| `INVESTIGATION_FIELDS` | Field names a technician may **not** send (both snake_case and camelCase) |
| `PROFILE_CODE_PATTERN` | `/^[A-Z0-9-]{6,50}$/` — the profile code format. Phase 4 compares these codes as strings |
| `updateAnalysis` | 1) checks the id; 2) rejects investigation fields; 3) finds the technician profile (403); 4) loads the sample within scope (404); 5) merges the body with current values (partial update); 6) validates status, profile code, dates and remarks; 7) applies the `Analyzed` / `Rejected` rules; 8) runs the lab-guarded update |
| `getLabSummary` | Finds the technician's lab, loads the counts, and converts `SUM()` strings or NULL into numbers |

```js
// ---------- Laboratory DNA Analysis Workflow (Member 1 - Issue 3) ----------

// Ei field gulo investigation info — technician egulo pathale request reject hobe
const INVESTIGATION_FIELDS = [
  'person_id', 'personId', 'family_id', 'familyId', 'lab_id', 'labId',
  'technician_id', 'technicianId', 'sample_type', 'sampleType',
  'collection_date', 'collectionDate', 'storage_location', 'storageLocation',
]

// DNA profile code format: boro hater letter, number ar hyphen, 6-50 character (jemon DNA7F2A91C4)
const PROFILE_CODE_PATTERN = /^[A-Z0-9-]{6,50}$/

// PUT /api/dna-samples/:id/analysis — technician er analysis update
export async function updateAnalysis(req, res) {
  try {
    const id = parseId(req.params.id)
    if (!id) {
      return res.status(400).json({ success: false, message: 'Invalid sample id.' })
    }

    // Technician investigation info change korte parbe na — egulo pathale shorashori reject
    const body = req.body || {}
    const forbidden = INVESTIGATION_FIELDS.filter(name => Object.prototype.hasOwnProperty.call(body, name))
    if (forbidden.length) {
      return res.status(400).json({
        success: false,
        message: 'Lab technicians can only update analysis fields (DNA profile code, analysis date, remarks, status).',
      })
    }

    // Logged-in user er technician profile na thakle kon lab er sample ta bojha jabe na
    const technician = await findTechnicianForUser(req.session.user)
    if (!technician) {
      return res.status(403).json({ success: false, message: 'No technician profile is linked to this account.' })
    }

    // Scope shoho sample load — onno lab er sample hole 404
    const existing = await findSampleById(id, req.session.user)
    if (!existing) {
      return res.status(404).json({ success: false, message: 'DNA sample not found.' })
    }

    // Partial update: je field pathano hoyni sheta existing value theke
    const statusField = readField(body, 'status')
    const profileField = readField(body, 'dna_profile_code', 'dnaProfileCode')
    const dateField = readField(body, 'analysis_date', 'analysisDate')
    const remarksField = readField(body, 'remarks')

    const status = statusField.provided ? normalizeText(statusField.value) : existing.status
    const rawProfile = profileField.provided ? profileField.value : existing.dna_profile_code
    const dnaProfileCode = typeof rawProfile === 'string' && rawProfile.trim() ? rawProfile.trim().toUpperCase() : null // uppercase e store
    const rawDate = dateField.provided ? dateField.value : formatDate(existing.analysis_date)
    const analysisDate = rawDate ? normalizeDate(rawDate) : null
    const remarks = remarksField.provided ? normalizeOptionalText(remarksField.value) : existing.remarks

    if (!SAMPLE_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid analysis status.' })
    }

    if (profileField.provided && profileField.value !== null && typeof profileField.value !== 'string') {
      return res.status(400).json({ success: false, message: 'DNA profile code must be text.' })
    }

    if (dnaProfileCode && !PROFILE_CODE_PATTERN.test(dnaProfileCode)) {
      return res.status(400).json({
        success: false,
        message: 'DNA profile code must be 6-50 characters using letters, numbers, or hyphens.',
      })
    }

    if (analysisDate === undefined) {
      return res.status(400).json({ success: false, message: 'Invalid analysis date.' })
    }

    if (remarks === undefined) {
      return res.status(400).json({ success: false, message: 'Remarks must be text.' })
    }

    // Analysis date collection date er age ba bhobishhote hote parbe na
    if (analysisDate) {
      if (analysisDate > formatDate(new Date())) {
        return res.status(400).json({ success: false, message: 'Analysis date cannot be in the future.' })
      }
      if (analysisDate < formatDate(existing.collection_date)) {
        return res.status(400).json({ success: false, message: 'Analysis date cannot be before the collection date.' })
      }
    }

    // Status onujayi rule:
    // Analyzed hole profile code + analysis date lagbe, Rejected hole karon (remarks) lagbe
    if (status === 'Analyzed' && (!dnaProfileCode || !analysisDate)) {
      return res.status(400).json({
        success: false,
        message: 'DNA profile code and analysis date are required to mark a sample as Analyzed.',
      })
    }

    if (status === 'Rejected' && !remarks) {
      return res.status(400).json({ success: false, message: 'Remarks are required when rejecting a sample.' })
    }

    const sample = await dbUpdateSampleAnalysis(id, technician.lab_id, technician.technician_id, {
      dnaProfileCode,
      analysisDate,
      remarks,
      status,
    })

    if (!sample) {
      return res.status(404).json({ success: false, message: 'DNA sample not found.' })
    }

    return res.status(200).json({
      success: true,
      message: 'DNA analysis updated successfully.',
      sample: formatSample(sample),
    })
  } catch (error) {
    console.error('Update DNA analysis error:', error)
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}

// GET /api/dna-samples/lab/summary — technician er lab er workload count
export async function getLabSummary(req, res) {
  try {
    const technician = await findTechnicianForUser(req.session.user)
    if (!technician) {
      return res.status(403).json({ success: false, message: 'No technician profile is linked to this account.' })
    }

    const summary = await findLabSampleSummary(technician.lab_id)

    // SUM() string/NULL ashe, tai Number e convert
    return res.status(200).json({
      success: true,
      summary: {
        labId: summary.lab_id,
        labName: summary.lab_name,
        totalSamples: Number(summary.total_samples),
        awaitingAnalysis: Number(summary.awaiting_analysis || 0),
        inAnalysis: Number(summary.in_analysis || 0),
        analyzed: Number(summary.analyzed || 0),
        rejected: Number(summary.rejected || 0),
      },
    })
  } catch (error) {
    console.error('Get lab summary error:', error)
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}
```

## 3.4 `backend/routes/dnaSampleRoutes.js` (modified)

`/lab/summary` goes **before** `/:id` (otherwise `lab` would be treated as an id). `/:id/analysis` is guarded with `requireRole('Lab Technician')`.

```diff
@@ -7,6 +7,8 @@ import {
   updateSample,
   deleteSample,
   getFamilyDna,
+  updateAnalysis,
+  getLabSummary,
 } from '../controllers/dnaSampleController.js'
 import { requireAuth } from '../middleware/authMiddleware.js'
 import { requireRole } from '../middleware/roleMiddleware.js'
@@ -18,14 +20,19 @@ const router = express.Router()
 // Technician family er contact info dekhbe na, tai shudhu Admin + Officer
 router.get('/family/:personId', requireAuth, requireRole('Admin', 'Officer'), getFamilyDna)
 
+// Technician er nijer lab er workload summary (Issue 3) — eta o '/:id' er AGE
+router.get('/lab/summary', requireAuth, requireRole('Lab Technician'), getLabSummary)
+
 // Admin, Officer, Lab Technician — tinjonei sample dekhte parbe (controller role onujayi data filter kore)
 router.get('/',requireAuth, requireRole('Admin', 'Officer', 'Lab Technician'), listSamples)
 router.get('/:id', requireAuth, requireRole('Admin', 'Officer', 'Lab Technician'), getSample)
 
 // Shudhu Admin ar Officer sample register/update/delete korte parbe
-// (Technician er analysis update Issue 3 e alada route e hobe)
 router.post('/', requireAuth, requireRole('Admin', 'Officer'), createSample)
 router.put('/:id', requireAuth, requireRole('Admin', 'Officer'), updateSample)
 router.delete('/:id', requireAuth, requireRole('Admin', 'Officer'), deleteSample)
 
+// Laboratory analysis update (Issue 3) — shudhu Lab Technician, shudhu analysis field
+router.put('/:id/analysis', requireAuth, requireRole('Lab Technician'), updateAnalysis)
+
 export default router
```

---

## 3.5 `frontend/src/services/dnaService.js` (modified)

```diff
@@ -64,6 +64,18 @@ export async function getSamplesByCase(caseId) {
   return getSamples({ case_id: caseId })
 }
 
+// Lab technician er analysis update — shudhu { status, dnaProfileCode, analysisDate, remarks } (Issue 3)
+export async function updateSampleAnalysis(id, data) {
+  const response = await api.put(`/dna-samples/${id}/analysis`, data)
+  return response.data.sample
+}
+
+// Technician er nijer lab er workload summary (Awaiting / In Analysis / Analyzed / Rejected count)
+export async function getLabSummary() {
+  const response = await api.get('/dna-samples/lab/summary')
+  return response.data.summary
+}
+
 // Missing person er family member + tader reference DNA sample (Issue 2)
 // Response: { summary: {...}, familyMembers: [{ familyId, name, relationship, phone, samples: [...] }] }
 export async function getFamilyDnaByPerson(personId) {
@@ -116,6 +128,8 @@ export default {
   getSamplesByPerson,
   getSamplesByCase,
   getFamilyDnaByPerson,
+  updateSampleAnalysis,
+  getLabSummary,
   getLabs,
   getTechnicians,
   getMatchesByPerson,
```

## 3.6 `frontend/src/pages/Laboratory.jsx` (modified)

| Change | What it does |
|---|---|
| `ANALYSIS_STATUSES` | Statuses a technician can choose: In Analysis, Analyzed, Rejected |
| `isPendingAnalysis(sample)` | True for `Awaiting Analysis` or `In Analysis` |
| `Samples()` | For technicians, loads `getLabSummary()` along with the list and shows **4 queue cards** (Awaiting / In Analysis / Analyzed / Rejected). The subtitle names the lab. The **Analyze** button appears for Awaiting **and** In Analysis samples |
| `SampleDetails()` | Technicians see **Analyze Sample** (pending) or **Update Analysis** (already analyzed/rejected) |
| `DNAAnalysis()` | **Rewritten.** It used to read mock `DataContext` data. Now it loads the sample from the API (404 if it belongs to another lab) and shows the collection data in a **read-only** card. The form has the 4 analysis fields and fills in existing values for corrections. Profile code and date are required when the status is Analyzed, and remarks are required when Rejected; the backend enforces the same rules. It sends **only** `{ status, analysisDate, dnaProfileCode, remarks }`, shows backend errors, and goes to the sample details page after saving |

```diff
@@ -1,16 +1,18 @@
 import { useCallback, useEffect, useMemo, useState } from 'react'
 import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
-import { PageHeader, SearchFilters, StatusBadge, TableAction } from '../components/Ui'
+import { MetricCard, PageHeader, SearchFilters, StatusBadge, TableAction } from '../components/Ui'
 import { useData } from '../data/DataContext'
 import { useAuth } from '../context/AuthContext'
 import {
   createSample,
   deleteSample,
   getLabs,
+  getLabSummary,
   getSampleById,
   getSamples,
   getTechnicians,
   updateSample,
+  updateSampleAnalysis,
 } from '../services/dnaService'
 import { getMissingPersons } from '../services/missingPersonService'
 import { getFamilyMembersByPerson } from '../services/familyMemberService'
@@ -30,6 +32,11 @@ const errorMessage = (error, fallback) => error.response?.data?.message || fallb
 const today = () => new Date().toISOString().slice(0, 10)
 const emptySampleForm = { personId: '', familyId: '', labId: '', technicianId: '', sampleType: '', collectionDate: '', storageLocation: '', remarks: '' }
 
+// Technician je status gulo set korte pare (Issue 3) — 'Awaiting Analysis' e ferot jawa lage na
+const ANALYSIS_STATUSES = ['In Analysis', 'Analyzed', 'Rejected']
+// Ei status e thakle sample ekhono "analyze" korar baki
+const isPendingAnalysis = sample => sample.status === 'Awaiting Analysis' || sample.status === 'In Analysis'
+
 // Sample ta kar — family reference hole family member er naam + relationship, noile missing person
 const sampleProvider = sample => sample.familyMemberName ? `${sample.familyMemberName} (${sample.familyRelationship})` : sample.personName
 
@@ -58,19 +65,26 @@ export function Samples() {
   const [deletingId, setDeletingId] = useState(null)
   const [query, setQuery] = useState('')
   const [filters, setFilters] = useState({ status: '', source: '' })
+  const [labSummary, setLabSummary] = useState(null) // technician er lab workload (Issue 3)
+  const isTechnician = role === 'Lab Technician'
 
-  // Backend theke sample list load kora
+  // Backend theke sample list (+ technician hole lab summary) load kora
   const refreshSamples = useCallback(async () => {
     try {
       setLoading(true)
       setError('')
-      setSamples(await getSamples(linkedPerson ? { person_id: linkedPerson } : {}))
+      const [rows, summary] = await Promise.all([
+        getSamples(linkedPerson ? { person_id: linkedPerson } : {}),
+        isTechnician ? getLabSummary() : Promise.resolve(null),
+      ])
+      setSamples(rows)
+      setLabSummary(summary)
     } catch (requestError) {
       setError(errorMessage(requestError, 'Failed to load DNA samples.'))
     } finally {
       setLoading(false)
     }
-  }, [linkedPerson])
+  }, [linkedPerson, isTechnician])
 
   useEffect(() => { refreshSamples() }, [refreshSamples])
 
@@ -101,10 +115,19 @@ export function Samples() {
     <>
       <PageHeader
         title="DNA Samples"
-        subtitle={linkedPerson ? 'Samples linked to the selected missing person.' : role === 'Lab Technician' ? 'DNA sample records assigned to your laboratory.' : role === 'Officer' ? 'DNA samples for your assigned investigation cases.' : 'DNA sample collection and analysis records.'}
+        subtitle={linkedPerson ? 'Samples linked to the selected missing person.' : isTechnician ? `DNA sample records assigned to ${labSummary?.labName || 'your laboratory'}.` : role === 'Officer' ? 'DNA samples for your assigned investigation cases.' : 'DNA sample collection and analysis records.'}
         action={canManage ? <Link to={`/dna-samples/new${linkedPerson ? `?personId=${linkedPerson}` : ''}`} className="btn btn-primary">Register DNA Sample</Link> : null}
       />
       {error && <div className="alert alert-danger" role="alert">{error}</div>}
+      {/* Technician er lab queue summary card (Issue 3 — technician sample view) */}
+      {labSummary && (
+        <div className="row g-3 mb-4">
+          <div className="col-sm-6 col-xl-3"><MetricCard label="Awaiting Analysis" value={labSummary.awaitingAnalysis} hint="Queued in your lab" tone="warning"/></div>
+          <div className="col-sm-6 col-xl-3"><MetricCard label="In Analysis" value={labSummary.inAnalysis} hint="Currently being processed"/></div>
+          <div className="col-sm-6 col-xl-3"><MetricCard label="Analyzed" value={labSummary.analyzed} hint="DNA profiles recorded" tone="success"/></div>
+          <div className="col-sm-6 col-xl-3"><MetricCard label="Rejected" value={labSummary.rejected} hint="Unusable samples"/></div>
+        </div>
+      )}
       <SearchFilters onSearchChange={setQuery} onClear={() => setFilters({ status: '', source: '' })}>
         <Filter label="State" value={filters.status} values={SAMPLE_STATUSES} onChange={status => setFilters({ ...filters, status })}/>
         <Filter label="Source" value={filters.source} values={SAMPLE_SOURCES} onChange={source => setFilters({ ...filters, source })}/>
@@ -127,7 +150,7 @@ export function Samples() {
                   <td><StatusBadge value={item.status}/></td>
                   <td className="text-nowrap">
                     <TableAction to={`/dna-samples/${item.id}`}/>
-                    {role === 'Lab Technician' && item.status === 'Awaiting Analysis' && <Link className="btn btn-sm btn-primary ms-1" to={`/lab/analysis/${item.id}`}>Analyze</Link>}
+                    {isTechnician && isPendingAnalysis(item) && <Link className="btn btn-sm btn-primary ms-1" to={`/lab/analysis/${item.id}`}>Analyze</Link>}
                     {canManage && <Link className="btn btn-sm btn-outline-secondary ms-1" to={`/dna-samples/${item.id}/edit`}>Edit</Link>}
                     {canManage && <button type="button" className="btn btn-sm btn-outline-danger ms-1" disabled={deletingId === item.id} onClick={() => remove(item)}>{deletingId === item.id ? 'Deleting...' : 'Delete'}</button>}
                   </td>
@@ -313,7 +336,8 @@ export function SampleDetails() {
         title={`DNA Sample #${sample.id}`}
         subtitle="DNA sample record"
         action={<>
-          {isTechnician && sample.status === 'Awaiting Analysis' && <Link className="btn btn-primary" to={`/lab/analysis/${sample.id}`}>Analyze Sample</Link>}
+          {/* Pending hole "Analyze", already analyzed/rejected hole correction er jonno "Update Analysis" */}
+          {isTechnician && <Link className="btn btn-primary" to={`/lab/analysis/${sample.id}`}>{isPendingAnalysis(sample) ? 'Analyze Sample' : 'Update Analysis'}</Link>}
           {canManage && <Link className="btn btn-outline-secondary" to={`/dna-samples/${sample.id}/edit`}>Edit</Link>}
           {canManage && <button type="button" className="btn btn-outline-danger" onClick={remove}>Delete</button>}
         </>}
@@ -353,8 +377,109 @@ export function SampleDetails() {
   )
 }
 
+// Lab Sample Analysis page (Member 1 - Issue 3)
+// Technician shudhu analysis info (status, analysis date, DNA profile code, laboratory remarks) update kore
+// Collection/investigation info read-only — backend o egulo pathale reject kore
 export function DNAAnalysis() {
-  const { id } = useParams(); const { data, updateSample } = useData(); const { user } = useAuth(); const sample = data.samples.find(item => item.id === id); const nav = useNavigate(); const [form, setForm] = useState({ analysis: '', profile: '', remarks: sample?.remarks || '' }); if (!sample) return <NotFound label="DNA sample"/>; if (sample.lab !== technicianLab(user, data)) return <AccessDenied/>; if (sample.status !== 'Awaiting Analysis') return <div className="alert alert-info">This sample has already been analyzed.</div>; const change = event => setForm({ ...form, [event.target.name]: event.target.value }); return <><PageHeader title={`Analyze ${sample.id}`} subtitle="Record analysis for this selected sample. Collection data remains read-only."/><div className="row g-4"><div className="col-lg-4"><Card title="Sample information"><p><span className="text-secondary d-block small">Source / provider</span>{sample.source} — {sampleOwner(sample, data)}</p><p><span className="text-secondary d-block small">Sample type</span>{sample.type}</p><p className="mb-0"><span className="text-secondary d-block small">Associated lab</span>{sample.lab}</p></Card></div><div className="col-lg-8"><form className="card" onSubmit={event => { event.preventDefault(); updateSample(sample.id, { ...form, status: 'Analyzed' }); nav(`/dna-samples/${sample.id}`) }}><div className="card-header bg-white"><strong>Analysis information</strong></div><div className="card-body"><div className="row g-3"><Field label="Analysis Date" name="analysis" type="date" required value={form.analysis} onChange={change}/><Field label="DNA Profile Code" name="profile" required value={form.profile} onChange={change}/><div className="col-12"><label className="form-label">Laboratory Remarks</label><textarea name="remarks" value={form.remarks} onChange={change} className="form-control" rows="6" required/></div></div></div><div className="card-footer bg-white text-end"><Link to={`/dna-samples/${sample.id}`} className="btn btn-light me-2">Cancel</Link><button className="btn btn-primary">Mark Analysis Complete</button></div></form></div></div></>
+  const { id } = useParams()
+  const nav = useNavigate()
+  const [sample, setSample] = useState(null)
+  const [form, setForm] = useState({ status: 'Analyzed', analysisDate: today(), dnaProfileCode: '', remarks: '' })
+  const [loading, setLoading] = useState(true)
+  const [saving, setSaving] = useState(false)
+  const [error, setError] = useState('')
+
+  // Sample load — onno lab er sample hole backend 404 dey
+  useEffect(() => {
+    let mounted = true
+    getSampleById(id)
+      .then(row => {
+        if (!mounted) return
+        setSample(row)
+        // Age theke analysis info thakle sheta diye form fill (correction er jonno)
+        setForm({
+          status: ANALYSIS_STATUSES.includes(row.status) ? row.status : 'Analyzed',
+          analysisDate: row.analysisDate || today(),
+          dnaProfileCode: row.dnaProfileCode || '',
+          remarks: row.remarks || '',
+        })
+      })
+      .catch(requestError => { if (mounted) setError(errorMessage(requestError, 'Failed to load the DNA sample.')) })
+      .finally(() => { if (mounted) setLoading(false) })
+    return () => { mounted = false }
+  }, [id])
+
+  const change = event => setForm({ ...form, [event.target.name]: event.target.value })
+
+  const submit = async event => {
+    event.preventDefault()
+    try {
+      setSaving(true)
+      setError('')
+      // Shudhu 4 ta analysis field pathano hocche — investigation field kokhono na
+      await updateSampleAnalysis(id, {
+        status: form.status,
+        analysisDate: form.analysisDate || null,
+        dnaProfileCode: form.dnaProfileCode.trim() || null,
+        remarks: form.remarks.trim() || null,
+      })
+      nav(`/dna-samples/${id}`)
+    } catch (requestError) {
+      setError(errorMessage(requestError, 'Failed to save the analysis.'))
+    } finally {
+      setSaving(false)
+    }
+  }
+
+  if (loading) return <div className="card"><div className="card-body text-center text-secondary py-4">Loading DNA sample...</div></div>
+  if (!sample) return <div className="alert alert-warning">{error || 'This DNA sample could not be found.'}</div>
+
+  const needsProfile = form.status === 'Analyzed' // Analyzed hole profile code + date lagbe
+  const needsRemarks = form.status === 'Rejected' // Rejected hole karon lagbe
+
+  return (
+    <>
+      <PageHeader title={`Analyze Sample #${sample.id}`} subtitle="Record the laboratory analysis for this sample. Collection data remains read-only."/>
+      {error && <div className="alert alert-danger" role="alert">{error}</div>}
+      <div className="row g-4">
+        <div className="col-lg-4">
+          {/* Read-only collection info — technician edit korte parbe na */}
+          <Card title="Sample information (read-only)">
+            <p><span className="text-secondary d-block small">Source / provider</span>{sample.source} — {sampleProvider(sample)}</p>
+            <p><span className="text-secondary d-block small">Sample type</span>{sample.sampleType}</p>
+            <p><span className="text-secondary d-block small">Collection date</span>{sample.collectionDate}</p>
+            <p><span className="text-secondary d-block small">Storage location</span>{sample.storageLocation || '—'}</p>
+            <p><span className="text-secondary d-block small">Assigned lab / technician</span>{sample.labName || '—'} / {sample.technicianName || 'Not assigned'}</p>
+            <p className="mb-0"><span className="text-secondary d-block small">Current status</span><StatusBadge value={sample.status}/></p>
+          </Card>
+        </div>
+        <div className="col-lg-8">
+          <form className="card" onSubmit={submit}>
+            <div className="card-header bg-white"><strong>Analysis information</strong></div>
+            <div className="card-body">
+              <div className="row g-3">
+                <Field label="Analysis Status" name="status" select required value={form.status} onChange={change} options={ANALYSIS_STATUSES}/>
+                <Field label="Analysis Date" name="analysisDate" type="date" required={needsProfile} value={form.analysisDate} onChange={change}/>
+                <div className="col-md-6">
+                  <label className="form-label">DNA Profile Code</label>
+                  <input name="dnaProfileCode" className="form-control text-uppercase" value={form.dnaProfileCode} onChange={change} required={needsProfile} placeholder="e.g. DNA7F2A91C4" pattern="[A-Za-z0-9\-]{6,50}" title="6-50 letters, numbers, or hyphens"/>
+                  <small className="text-secondary">Required when the status is Analyzed.</small>
+                </div>
+                <div className="col-12">
+                  <label className="form-label">Laboratory Remarks</label>
+                  <textarea name="remarks" value={form.remarks} onChange={change} className="form-control" rows="5" required={needsRemarks} placeholder={needsRemarks ? 'Reason for rejecting the sample' : 'Extraction method, quality notes, etc.'}/>
+                </div>
+              </div>
+            </div>
+            <div className="card-footer bg-white text-end">
+              <Link to={`/dna-samples/${sample.id}`} className="btn btn-light me-2">Cancel</Link>
+              <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Analysis'}</button>
+            </div>
+          </form>
+        </div>
+      </div>
+    </>
+  )
 }
 
 export function Matches() {
```

---

## Phase 3 testing

**SQL:** queries 14–20 ran on local MySQL. The technician lookup returned lab 1. The queue returned sample 3. The summary returned {3 total, 1 awaiting, 2 analyzed}. The analysis UPDATE auto-assigned technician 1 through `COALESCE`. The test row was deleted.

**API:** tested with curl. Test users: Admin, Officer 1, Technician 1 (linked through `users.technician_id`, lab 1), Technician 2 (linked through `lab_technicians.user_id`, lab 2) and a technician account with no profile. For the tests, Officer 1 registered a new lab-1 sample with no technician assigned.

| Test | Result |
|---|---|
| Tech 1 / Tech 2 `GET /lab/summary` | Lab 1 counts / lab 2 counts (both linking methods work) |
| Technician with no profile | 403 "No technician profile is linked to this account." |
| Admin `GET /lab/summary` | 403 |
| Admin / Officer `PUT /:id/analysis` | 403 Access denied |
| Tech 2 (lab 2) analyzes a lab-1 sample | 404 |
| Tech sends `labId` / `personId` + `sampleType` | 400 "Lab technicians can only update analysis fields ..." |
| Tech uses the Officer endpoint `PUT /:id` | 403 |
| Status `Done` | 400 Invalid analysis status |
| `Analyzed` without code/date, or with code but no date | 400 |
| Profile code `ab$` | 400 format error |
| Analysis date before collection / in the future | 400 / 400 |
| `Rejected` with empty remarks | 400 |
| `In Analysis` + remarks | 200. **Technician auto-assigned** (Tanvir Hossain). Summary: awaiting 2→1, in analysis 0→1 |
| `Analyzed` with code `dna7f2a91c5` | 200. Saved as `DNA7F2A91C5` with the date |
| Officer views the sample | Sees the analysis result |
| Tech sends only `remarks` (correction) | 200. Other fields kept |
| Summary after | analyzed 2→3 |

The test sample, test users and the temporary `lab_technicians.user_id` link were removed or reset afterwards.

**Frontend:** `oxlint` found no issues and `vite build` succeeded. The pages were not clicked through in a browser.

## Known gaps after Phase 3

- The Matches pages (`Matches`, `MatchDetails`) and `getMatchesBy*` are still mock (Phase 4).
- The Lab Technician **dashboard** (`Dashboards.jsx`) still shows mock counts (Phase 7). The same counts are now available from `getLabSummary()`.

---

# Phase 4 — Issue 4: DNA Matching Workflow

## Goal

Create DNA match records. Two samples are compared, the result is stored, and the match is reviewed:

```
Analyzed unknown/evidence sample ─┐
                                  ├─> Compare profile codes ─> dna_matches (Pending Review) ─> Confirmed / Rejected
Analyzed reference sample ────────┘
```

As the spec asks, this is **not** real biological DNA matching. The goal is to show the workflow. **Both options from the spec are implemented:**

| Option | How it works | Who | `match_method` |
|---|---|---|---|
| **1. String similarity** | Compares the two stored `dna_profile_code` values **position by position, in raw SQL** (recursive CTE) | Admin, Officer, Lab Technician | `Computed` |
| **2. Manual similarity** | Admin/Officer types the similarity percentage | Admin, Officer only | `Manual` |

**Similarity formula:** (number of positions where the characters match ÷ length of the longer code) × 100

| Example | Matching positions | Similarity | Confidence |
|---|---|---|---|
| `ABC12345` vs `ABC12346` (spec example) | 7 / 8 | **87.50%** | Medium |
| `DNA7F2A91C4` vs `DNA7F2A91C9` (seed: John Doe's evidence vs his father) | 10 / 11 | **90.91%** | High |

**Confidence level:** ≥ 90 → High, ≥ 80 → Medium, otherwise Low.

## Files changed

| File | Type | What changed |
|---|---|---|
| `database/sql/dna_matches.sql` | New | Table, SQL comparison (recursive CTE), insert (computed + manual), scoped views, duplicate check, review update |
| `database/schema.sql` | Modified | Added the `dna_matches` table |
| `database/seed.sql` | Modified | 2 demo matches (1 Pending Review, 1 Rejected) |
| `backend/models/dnaMatchModel.js` | New | Runs the raw SQL through `mysql2` |
| `backend/controllers/dnaMatchController.js` | New | Pair validation, compare, create, review, delete |
| `backend/routes/dnaMatchRoutes.js` | New | Endpoints plus role guards |
| `backend/server.js` | Modified | Mounted `/api/dna-matches` |
| `frontend/src/services/dnaService.js` | Modified | **Removed all mock match code.** Added real match API functions |
| `frontend/src/components/MatchesList.jsx` | Modified | Removed the mock label. Links to match details, shows the provider and status badges |
| `frontend/src/pages/Laboratory.jsx` | Modified | Real `Matches`, new `MatchForm`, real `MatchDetails`, `CodeComparison`. **Removed every remaining mock/DataContext helper** |
| `frontend/src/routes/AppRoutes.jsx` | Modified | Added `/dna-matches/new` |

## Table `dna_matches`

| Column | Type | Notes |
|---|---|---|
| `match_id` | INT PK AUTO_INCREMENT | |
| `unknown_sample_id` | INT NOT NULL | FK → `dna_samples`, `ON DELETE CASCADE` |
| `matched_sample_id` | INT NOT NULL | FK → `dna_samples`, `ON DELETE CASCADE` |
| `similarity_percentage` | DECIMAL(5,2) NOT NULL | `CHECK (BETWEEN 0 AND 100)` |
| `confidence_level` | VARCHAR(10) | High / Medium / Low |
| `match_date` | DATE | `CURDATE()` when created |
| `match_status` | VARCHAR(20) | Pending Review (default) / Confirmed / Rejected |
| `match_method` | VARCHAR(20) | Computed / Manual (extra column, so Option 1 and Option 2 can be told apart) |
| `created_at`, `updated_at` | TIMESTAMP | Same pattern as the other tables |

`UNIQUE (unknown_sample_id, matched_sample_id)` stops the same pair from being saved twice. The controller also checks the reversed pair.

## API endpoints

| Method | Endpoint | Roles | Purpose |
|---|---|---|---|
| GET | `/api/dna-matches` | Admin, Officer, Lab Technician | List (scoped). Filters: `status`, `confidence`, `person_id`, `case_id`, `sample_id` |
| GET | `/api/dna-matches/:id` | Admin, Officer, Lab Technician | Details (scoped) |
| POST | `/api/dna-matches/compare` | Admin, Officer, Lab Technician | **Preview**: runs the SQL comparison without saving. Also returns `existingMatchId` |
| POST | `/api/dna-matches` | Admin, Officer, Lab Technician | Save a match. No `similarityPercentage` → Computed. With `similarityPercentage` → Manual (Admin/Officer only) |
| PUT | `/api/dna-matches/:id/status` | Admin, Officer | Review: `Pending Review` → `Confirmed` / `Rejected` |
| DELETE | `/api/dna-matches/:id` | Admin | Delete a wrong match (not allowed for Confirmed ones) |

## Access and validation rules

| Rule | Result |
|---|---|
| **View scope:** Admin sees all. An Officer sees a match if **either** sample's missing person is in their cases. A Technician sees it if **either** sample is in their lab | Out-of-scope → 404 |
| **Compare/create:** the user must be able to access **both** samples (the Phase 1 sample scope is reused) | 404 "Unknown/Matched sample not found." |
| Same sample twice | 400 |
| The unknown sample is a **family reference** | 400. The unknown sample must be evidence or the missing person's own sample |
| Either sample isn't `Analyzed` or has no profile code | 400 |
| Pair already compared (either direction) | 409 |
| Technician sends `similarityPercentage` | 403 "Only Admin and Officer can enter similarity manually." |
| Manual similarity is not a number between 0 and 100 | 400 (rounded to 2 decimals) |
| Review a match that isn't `Pending Review` | 409, so a review can't be changed afterwards |
| Delete a `Confirmed` match | 409, because it is the evidence behind the identification |

## Design decisions

- **The comparison runs in SQL**, not JavaScript, so the matching logic is raw SQL as the project requires. `WITH RECURSIVE positions` generates the numbers 1…N. `SUBSTRING(code, pos, 1)` compares each position, and `SUM(...)` counts the positions that match.
- **Unknown vs matched:** the unknown sample must have `family_id IS NULL` (evidence, or the missing person's own sample). The matched sample can be any analyzed sample, usually a family reference. In Phase 5, the trigger will mark the **matched sample's missing person** as Identified.
- **Cross-case comparison is possible for Admin:** a sample from person A's case can be compared with a reference from person B. That is how an unknown person gets identified. Officers and technicians are limited to samples in their own scope.
- **Review is a separate step** handled by Admin/Officer. It is an investigation decision, not a lab decision.
- **All lab pages now use real data.** `Laboratory.jsx` no longer imports `useData`. The unused mock helpers (`sampleOwner`, `technicianLab`, `labCanAccessSample`, `describeSample`, `NotFound`, `AccessDenied`) were removed.

---

## 4.1 `database/sql/dna_matches.sql` (new)

| Query | What it does |
|---|---|
| 0 | `CREATE TABLE dna_matches` with UNIQUE pair, CHECK on similarity, and 2 cascading FKs. (A CHECK on the FK columns isn't possible: MySQL doesn't allow it on columns used by `ON DELETE CASCADE`, so "same sample twice" is checked in the controller) |
| 1 | **The comparison**: CTE `codes` puts both profile codes and the longer length in one row. The recursive CTE `positions` generates 1…max_length. `CROSS JOIN` + `SUM(SUBSTRING(a,pos,1) = SUBSTRING(b,pos,1))` counts matches, then `ROUND(... / max_length * 100, 2)` gives the similarity, and `CASE` gives the confidence |
| 1b | Checks the spec example: `ABC12345` vs `ABC12346` = **87.50** |
| 2 / 2b | INSERT a computed match / a manual match (Option 2) |
| 3 | Admin view: `dna_samples` is joined **twice** (`u` = unknown, `ms` = matched), plus persons, family names and relationships |
| 4 | Officer view: `EXISTS (... cf.officer_id = ? AND cf.person_id IN (u.person_id, ms.person_id))` |
| 5 | Technician view: `u.lab_id IN (tech lab) OR ms.lab_id IN (tech lab)` |
| 6 | Matches of one missing person (used by the Missing Person Details tab) |
| 7 | Duplicate check in both directions |
| 8 | Review UPDATE with `AND match_status = 'Pending Review'` |
| 9–10 | Details + cleanup of the test rows |

```sql
-- =========================================================
-- ForenTrace: DNA Matching Queries (Member 1 - Issue 4)
-- File: database/sql/dna_matches.sql
-- Ei file-er shob query age MySQL-e test kora hoyeche, tarpor
-- backend/models/dnaMatchModel.js e mysql2 diye use kora hoyeche.
--
-- Matching logic (checkpoint/demo er jonno — real biological matching na):
--   Duita sample er stored DNA profile code position-by-position compare kora hoy.
--   similarity = (je position e character mile) / (boro code er length) * 100
--   Example: ABC12345 vs ABC12346 → 8 tar moddhe 7 ta mile → 87.5%
-- =========================================================

USE forentrace_db;

-- 0. Table: dna_matches
-- Relationship:
--   DNASample 1 : M DNAMatch (unknown_sample_id hishebe — evidence/unknown sample)
--   DNASample 1 : M DNAMatch (matched_sample_id hishebe — reference sample)
CREATE TABLE IF NOT EXISTS dna_matches (
    match_id INT AUTO_INCREMENT PRIMARY KEY,
    unknown_sample_id INT NOT NULL,          -- FK: je unknown/evidence sample er identity khuja hocche
    matched_sample_id INT NOT NULL,          -- FK: jar sathe compare kora hoyeche (family reference ba onno sample)
    similarity_percentage DECIMAL(5,2) NOT NULL, -- 0.00 - 100.00
    confidence_level VARCHAR(10) NOT NULL,   -- High / Medium / Low (similarity theke ber kora)
    match_date DATE NOT NULL,                -- kobe comparison kora hoyeche
    match_status VARCHAR(20) NOT NULL DEFAULT 'Pending Review', -- Pending Review / Confirmed / Rejected
    match_method VARCHAR(20) NOT NULL DEFAULT 'Computed',       -- Computed (profile code compare) / Manual (hat e similarity)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Ek jora sample er match ekbar-i record hobe
    CONSTRAINT uq_match_pair UNIQUE (unknown_sample_id, matched_sample_id),

    -- Similarity 0 theke 100 er moddhe thakte hobe
    CONSTRAINT chk_match_similarity CHECK (similarity_percentage BETWEEN 0 AND 100),

    -- Sample delete hole tar match record o delete hobe
    CONSTRAINT fk_match_unknown_sample
        FOREIGN KEY (unknown_sample_id) REFERENCES dna_samples(sample_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_match_matched_sample
        FOREIGN KEY (matched_sample_id) REFERENCES dna_samples(sample_id)
        ON DELETE CASCADE
);


-- 1. Compare two samples (Option 1: string similarity in SQL)
-- WITH RECURSIVE diye 1..N position er ekta list banano hoy (N = boro code er length),
-- tarpor proti position e SUBSTRING diye character mile kina check kore SUM kora hoy.
-- Unknown sample = 1 (John Doe er toothbrush evidence), Matched sample = 2 (father er reference)
SET @unknown_sample_id = 1;
SET @matched_sample_id = 2;

WITH RECURSIVE
codes AS (
    -- Duita sample er profile code ek row te ana
    SELECT
        u.dna_profile_code AS unknown_code,
        m.dna_profile_code AS matched_code,
        GREATEST(CHAR_LENGTH(u.dna_profile_code), CHAR_LENGTH(m.dna_profile_code)) AS max_length
    FROM dna_samples u
    INNER JOIN dna_samples m ON m.sample_id = @matched_sample_id
    WHERE u.sample_id = @unknown_sample_id
),
positions AS (
    -- 1, 2, 3 ... max_length porjonto number generate (recursive CTE)
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
    -- Ek position e duitar character same hole 1, noile 0 → SUM = koto position mile
    SUM(SUBSTRING(c.unknown_code, p.pos, 1) = SUBSTRING(c.matched_code, p.pos, 1)) AS matching_positions,
    ROUND(SUM(SUBSTRING(c.unknown_code, p.pos, 1) = SUBSTRING(c.matched_code, p.pos, 1)) / c.max_length * 100, 2) AS similarity_percentage,
    -- Similarity theke confidence level
    CASE
        WHEN ROUND(SUM(SUBSTRING(c.unknown_code, p.pos, 1) = SUBSTRING(c.matched_code, p.pos, 1)) / c.max_length * 100, 2) >= 90 THEN 'High'
        WHEN ROUND(SUM(SUBSTRING(c.unknown_code, p.pos, 1) = SUBSTRING(c.matched_code, p.pos, 1)) / c.max_length * 100, 2) >= 80 THEN 'Medium'
        ELSE 'Low'
    END AS confidence_level
FROM codes c
CROSS JOIN positions p
GROUP BY c.unknown_code, c.matched_code, c.max_length;


-- 1b. Spec er example verify: 'ABC12345' vs 'ABC12346' → 87.50
WITH RECURSIVE
codes AS (
    SELECT 'ABC12345' AS unknown_code, 'ABC12346' AS matched_code, 8 AS max_length
),
positions AS (
    SELECT 1 AS pos
    UNION ALL
    SELECT p.pos + 1 FROM positions p INNER JOIN codes c ON p.pos < c.max_length
)
SELECT
    ROUND(SUM(SUBSTRING(c.unknown_code, p.pos, 1) = SUBSTRING(c.matched_code, p.pos, 1)) / c.max_length * 100, 2) AS similarity_percentage
FROM codes c
CROSS JOIN positions p
GROUP BY c.unknown_code, c.matched_code, c.max_length;


-- 2. Create DNA Match record (INSERT) — computed result save
INSERT INTO dna_matches (
    unknown_sample_id, matched_sample_id, similarity_percentage,
    confidence_level, match_date, match_status, match_method
) VALUES (
    1, 3, 72.73, 'Low', CURDATE(), 'Pending Review', 'Computed'
);
SET @new_match_id = LAST_INSERT_ID();


-- 2b. Option 2: Admin/Officer hat e similarity diye match create (Manual)
INSERT INTO dna_matches (
    unknown_sample_id, matched_sample_id, similarity_percentage,
    confidence_level, match_date, match_status, match_method
) VALUES (
    5, 3, 85.00, 'Medium', CURDATE(), 'Pending Review', 'Manual'
);
SET @manual_match_id = LAST_INSERT_ID();


-- 3. View all DNA matches with both sample details (Admin view)
-- dna_samples table ke duibar JOIN (u = unknown, ms = matched) — self-join er moto alias
SELECT
    m.match_id,
    m.unknown_sample_id,
    CONCAT(up.first_name, ' ', up.last_name) AS unknown_person_name,
    u.dna_profile_code AS unknown_profile_code,
    m.matched_sample_id,
    CONCAT(mp.first_name, ' ', mp.last_name) AS matched_person_name,
    CONCAT(mf.first_name, ' ', mf.last_name) AS matched_family_name,
    mf.relationship AS matched_family_relationship,
    ms.dna_profile_code AS matched_profile_code,
    m.similarity_percentage,
    m.confidence_level,
    m.match_date,
    m.match_status,
    m.match_method
FROM dna_matches m
INNER JOIN dna_samples u ON u.sample_id = m.unknown_sample_id
INNER JOIN missing_persons up ON up.person_id = u.person_id
INNER JOIN dna_samples ms ON ms.sample_id = m.matched_sample_id
INNER JOIN missing_persons mp ON mp.person_id = ms.person_id
LEFT JOIN family_members mf ON mf.family_id = ms.family_id
ORDER BY m.match_id DESC;


-- 4. Officer view: je match er kono ekta sample tar assigned case er (officer_id = 1)
SELECT m.match_id, m.unknown_sample_id, m.matched_sample_id, m.similarity_percentage, m.match_status
FROM dna_matches m
INNER JOIN dna_samples u ON u.sample_id = m.unknown_sample_id
INNER JOIN dna_samples ms ON ms.sample_id = m.matched_sample_id
WHERE EXISTS (
    SELECT 1
    FROM case_files cf
    WHERE cf.officer_id = 1
      AND cf.person_id IN (u.person_id, ms.person_id)
)
ORDER BY m.match_id DESC;


-- 5. Lab Technician view: je match er kono ekta sample tar lab er (user_id = 2 ba technician_id = 1)
SELECT m.match_id, m.unknown_sample_id, m.matched_sample_id, m.similarity_percentage, m.match_status
FROM dna_matches m
INNER JOIN dna_samples u ON u.sample_id = m.unknown_sample_id
INNER JOIN dna_samples ms ON ms.sample_id = m.matched_sample_id
WHERE u.lab_id IN (SELECT lt.lab_id FROM lab_technicians lt WHERE lt.user_id = 2 OR lt.technician_id = 1)
   OR ms.lab_id IN (SELECT lt.lab_id FROM lab_technicians lt WHERE lt.user_id = 2 OR lt.technician_id = 1)
ORDER BY m.match_id DESC;


-- 6. Ekta missing person er shob match (Missing Person Details → DNA Matches tab, person_id = 1)
SELECT m.match_id, m.unknown_sample_id, m.matched_sample_id, m.similarity_percentage, m.confidence_level, m.match_status
FROM dna_matches m
INNER JOIN dna_samples u ON u.sample_id = m.unknown_sample_id
INNER JOIN dna_samples ms ON ms.sample_id = m.matched_sample_id
WHERE u.person_id = 1 OR ms.person_id = 1
ORDER BY m.match_id DESC;


-- 7. Duplicate check: ei duita sample age theke (je kono direction e) compare kora hoyeche kina
SELECT match_id
FROM dna_matches
WHERE (unknown_sample_id = 1 AND matched_sample_id = 3)
   OR (unknown_sample_id = 3 AND matched_sample_id = 1)
LIMIT 1;


-- 8. Review: match status update (Pending Review → Confirmed / Rejected)
-- Shudhu 'Pending Review' match review kora jay (WHERE e check)
UPDATE dna_matches
SET match_status = 'Rejected'
WHERE match_id = @new_match_id
  AND match_status = 'Pending Review';


-- 9. Single match details
SELECT *
FROM dna_matches
WHERE match_id = @new_match_id;


-- 10. Delete test matches (seed data jeno thik thake)
DELETE FROM dna_matches
WHERE match_id IN (@new_match_id, @manual_match_id);
```

## 4.2 `database/schema.sql` (modified)

```diff
@@ -227,4 +227,27 @@ CREATE TABLE IF NOT EXISTS dna_samples (
     CONSTRAINT fk_sample_technician
         FOREIGN KEY (technician_id) REFERENCES lab_technicians(technician_id)
         ON DELETE RESTRICT
+);
+
+-- DNA Matches Table (Member 1 - Issue 4)
+-- Raw SQL + query gulo: database/sql/dna_matches.sql
+CREATE TABLE IF NOT EXISTS dna_matches (
+    match_id INT AUTO_INCREMENT PRIMARY KEY,
+    unknown_sample_id INT NOT NULL,          -- FK: unknown/evidence sample
+    matched_sample_id INT NOT NULL,          -- FK: reference sample
+    similarity_percentage DECIMAL(5,2) NOT NULL,
+    confidence_level VARCHAR(10) NOT NULL,   -- High / Medium / Low
+    match_date DATE NOT NULL,
+    match_status VARCHAR(20) NOT NULL DEFAULT 'Pending Review', -- Pending Review / Confirmed / Rejected
+    match_method VARCHAR(20) NOT NULL DEFAULT 'Computed',       -- Computed / Manual
+    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
+    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
+    CONSTRAINT uq_match_pair UNIQUE (unknown_sample_id, matched_sample_id),
+    CONSTRAINT chk_match_similarity CHECK (similarity_percentage BETWEEN 0 AND 100),
+    CONSTRAINT fk_match_unknown_sample
+        FOREIGN KEY (unknown_sample_id) REFERENCES dna_samples(sample_id)
+        ON DELETE CASCADE,
+    CONSTRAINT fk_match_matched_sample
+        FOREIGN KEY (matched_sample_id) REFERENCES dna_samples(sample_id)
+        ON DELETE CASCADE
 );
\ No newline at end of file
```

## 4.3 `database/seed.sql` (modified)

Match 1 is **Pending Review** on purpose, so Phase 5's trigger can be demonstrated by confirming it.

```diff
@@ -84,4 +84,16 @@ INSERT INTO dna_samples (
 (4, 2, 3, 2, 3, 'Buccal Swab', '2026-05-15', 'Freezer B-02', 'Reference sample from brother', NULL, NULL, 'Awaiting Analysis'),
 (5, 2, NULL, 2, 3, 'Hair Strand', '2026-05-14', 'Evidence Room B-04', 'Hair strand from hostel room', '2026-05-20', 'DNA8C114A90', 'Analyzed'),
 (6, 3, NULL, 3, 4, 'Bone Sample', '2026-01-25', 'Evidence Room C-01', 'Recovered remains sample', '2026-02-02', 'DNA5B7E20D1', 'Analyzed')
-ON DUPLICATE KEY UPDATE sample_id = sample_id;
\ No newline at end of file
+ON DUPLICATE KEY UPDATE sample_id = sample_id;
+
+-- Seed Data for dna_matches (Member 1 - Issue 4)
+-- Similarity gulo database/sql/dna_matches.sql er comparison query diye ber kora:
+--   Sample 1 (DNA7F2A91C4) vs Sample 2 (DNA7F2A91C9) = 10/11 = 90.91% High   (John Doe evidence vs father)
+--   Sample 5 (DNA8C114A90) vs Sample 2 (DNA7F2A91C9) =  3/11 = 27.27% Low    (Jane Smith evidence vs John er father)
+INSERT INTO dna_matches (
+    match_id, unknown_sample_id, matched_sample_id, similarity_percentage,
+    confidence_level, match_date, match_status, match_method
+) VALUES
+(1, 1, 2, 90.91, 'High', '2026-03-02', 'Pending Review', 'Computed'),
+(2, 5, 2, 27.27, 'Low', '2026-05-21', 'Rejected', 'Computed')
+ON DUPLICATE KEY UPDATE match_id = match_id;
\ No newline at end of file
```

---

## 4.4 `backend/models/dnaMatchModel.js` (new)

| Function | What it does |
|---|---|
| `matchSelect` | Joined SELECT: the match + both samples (person name, family name/relationship, sample type, profile code, lab) |
| `scopeCondition(user)` | Role filter: Officer → `EXISTS` on `case_files`. Technician → lab subquery on either sample |
| `findAllMatches(filters, user)` | List with `status` / `confidence` / `personId` / `caseId` / `sampleId` filters + scope |
| `findMatchById(id, user)` | One match, or `null` if missing or out of scope |
| `compareProfileCodes(unknownId, matchedId)` | Runs **query 1** (recursive CTE) and returns codes, length, matching positions and similarity |
| `findMatchBetween(a, b)` | Query 7: duplicate check in both directions |
| `createMatch(values)` | INSERT with `CURDATE()` and `'Pending Review'`, then returns the joined row |
| `updateMatchStatus(id, status)` | Query 8 (only updates a Pending Review match) |
| `deleteMatchById(id)` | DELETE |

```js
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
```

## 4.5 `backend/controllers/dnaMatchController.js` (new)

| Function | What it does |
|---|---|
| `confidenceFor(similarity)` | 90/80 thresholds (same as the SQL `CASE`) |
| `formatMatch(row)` | API object with camelCase + snake_case keys (the snake_case ones are for `MatchesList`) and nested `unknownSample` / `matchedSample` objects with a readable `provider` |
| `validatePair(body, user)` | Both ids present and different → both samples in the user's scope (reuses `dnaSampleModel.findSampleById`) → unknown is not a family reference → both Analyzed with a profile code |
| `listMatches` / `getMatch` | Filters validated, scoped queries |
| `compareSamples` | Validate → SQL comparison → returns the preview + `existingMatchId` |
| `createMatch` | Validate → duplicate check → **Manual** (Admin/Officer, 0–100) or **Computed** (SQL) → insert. `ER_DUP_ENTRY` → 409 |
| `reviewMatch` | Only Confirmed/Rejected, only from Pending Review, scoped |
| `deleteMatch` | Admin only; Confirmed matches are protected |

```js
import {
  findAllMatches,
  findMatchById,
  compareProfileCodes,
  findMatchBetween,
  createMatch as dbCreateMatch,
  updateMatchStatus as dbUpdateMatchStatus,
  deleteMatchById as dbDeleteMatch,
} from '../models/dnaMatchModel.js'
import { findSampleById } from '../models/dnaSampleModel.js' // sample access check er jonno reuse

// Match er allowed status ar confidence value
export const MATCH_STATUSES = ['Pending Review', 'Confirmed', 'Rejected']
const REVIEW_STATUSES = ['Confirmed', 'Rejected'] // review e ei duita te change kora jay
const CONFIDENCE_LEVELS = ['High', 'Medium', 'Low']

// Similarity theke confidence level (dna_matches.sql er CASE er sathe same threshold)
function confidenceFor(similarity) {
  if (similarity >= 90) return 'High'
  if (similarity >= 80) return 'Medium'
  return 'Low'
}

// Database er DATE ke YYYY-MM-DD format e convert
function formatDate(value) {
  if (!value) return null
  if (typeof value === 'string') return value.slice(0, 10)

  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Sample ta kar — family reference hole "Name (Relationship)", noile missing person er naam
function sampleProvider(familyName, relationship, personName) {
  return familyName ? `${familyName} (${relationship})` : personName
}

// Database row ke API response object e convert (camelCase + snake_case — MatchesList component er jonno)
export function formatMatch(row) {
  if (!row) return null

  const similarity = Number(row.similarity_percentage)

  return {
    id: row.match_id,
    matchId: row.match_id,
    match_id: row.match_id,
    unknownSampleId: row.unknown_sample_id,
    unknown_sample_id: row.unknown_sample_id,
    matchedSampleId: row.matched_sample_id,
    matched_sample_id: row.matched_sample_id,
    similarityPercentage: similarity,
    similarity_percentage: similarity,
    confidenceLevel: row.confidence_level,
    confidence_level: row.confidence_level,
    matchDate: formatDate(row.match_date),
    match_date: formatDate(row.match_date),
    matchStatus: row.match_status,
    match_status: row.match_status,
    matchMethod: row.match_method,
    // Unknown (evidence) sample er info
    unknownSample: {
      id: row.unknown_sample_id,
      personId: row.unknown_person_id,
      personName: row.unknown_person_name,
      provider: sampleProvider(row.unknown_family_name, row.unknown_family_relationship, row.unknown_person_name),
      sampleType: row.unknown_sample_type,
      profileCode: row.unknown_profile_code,
      labName: row.unknown_lab_name,
    },
    // Matched (reference) sample er info
    matchedSample: {
      id: row.matched_sample_id,
      personId: row.matched_person_id,
      personName: row.matched_person_name,
      personStatus: row.matched_person_status,
      provider: sampleProvider(row.matched_family_name, row.matched_family_relationship, row.matched_person_name),
      isFamilyReference: Boolean(row.matched_family_id),
      sampleType: row.matched_sample_type,
      profileCode: row.matched_profile_code,
      labName: row.matched_lab_name,
    },
  }
}

// URL/body theke asha id valid positive integer kina
function parseId(value) {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) return null
  return id
}

// snake_case ba camelCase — je kono naam er field pora
function readField(body, ...names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(body, name)) {
      return { provided: true, value: body[name] }
    }
  }

  return { provided: false, value: undefined }
}

// Compare/create er age duita sample check kore — error thakle { status, message }
async function validatePair(body, user) {
  const unknownSampleId = parseId(readField(body, 'unknown_sample_id', 'unknownSampleId').value)
  const matchedSampleId = parseId(readField(body, 'matched_sample_id', 'matchedSampleId').value)

  if (!unknownSampleId || !matchedSampleId) {
    return { error: { status: 400, message: 'Unknown sample ID and matched sample ID are required.' } }
  }

  if (unknownSampleId === matchedSampleId) {
    return { error: { status: 400, message: 'A sample cannot be compared with itself.' } }
  }

  // User er scope e na thakle null ashbe (officer = nijer case, technician = nijer lab)
  const unknown = await findSampleById(unknownSampleId, user)
  if (!unknown) {
    return { error: { status: 404, message: 'Unknown sample not found.' } }
  }

  const matched = await findSampleById(matchedSampleId, user)
  if (!matched) {
    return { error: { status: 404, message: 'Matched sample not found.' } }
  }

  // Unknown sample hobe evidence/missing person er sample — family reference na
  if (unknown.family_id) {
    return { error: { status: 400, message: 'The unknown sample must be a missing person / evidence sample, not a family reference.' } }
  }

  // Analysis chara profile code thake na — compare kora jabe na
  if (unknown.status !== 'Analyzed' || !unknown.dna_profile_code || matched.status !== 'Analyzed' || !matched.dna_profile_code) {
    return { error: { status: 400, message: 'Both samples must be analyzed with a DNA profile code before comparison.' } }
  }

  return { unknownSampleId, matchedSampleId }
}

// GET /api/dna-matches — role onujayi scoped match list
export async function listMatches(req, res) {
  try {
    const status = req.query.status?.trim() || ''
    const confidence = req.query.confidence?.trim() || ''

    if (status && !MATCH_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid match status filter.' })
    }

    if (confidence && !CONFIDENCE_LEVELS.includes(confidence)) {
      return res.status(400).json({ success: false, message: 'Invalid confidence filter.' })
    }

    const matches = await findAllMatches(
      {
        status: status || undefined,
        confidence: confidence || undefined,
        personId: parseId(req.query.person_id ?? req.query.personId) || undefined,
        caseId: parseId(req.query.case_id ?? req.query.caseId) || undefined,
        sampleId: parseId(req.query.sample_id ?? req.query.sampleId) || undefined,
      },
      req.session.user
    )

    return res.status(200).json({ success: true, matches: matches.map(formatMatch) })
  } catch (error) {
    console.error('List DNA matches error:', error)
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}

// GET /api/dna-matches/:id — ekta match er details
export async function getMatch(req, res) {
  try {
    const id = parseId(req.params.id)
    if (!id) {
      return res.status(400).json({ success: false, message: 'Invalid match id.' })
    }

    const match = await findMatchById(id, req.session.user)
    if (!match) {
      return res.status(404).json({ success: false, message: 'DNA match not found.' })
    }

    return res.status(200).json({ success: true, match: formatMatch(match) })
  } catch (error) {
    console.error('Get DNA match error:', error)
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}

// POST /api/dna-matches/compare — shudhu comparison result dekhay (save kore na) — preview er jonno
export async function compareSamples(req, res) {
  try {
    const pair = await validatePair(req.body || {}, req.session.user)
    if (pair.error) {
      return res.status(pair.error.status).json({ success: false, message: pair.error.message })
    }

    const result = await compareProfileCodes(pair.unknownSampleId, pair.matchedSampleId)
    const similarity = Number(result.similarity_percentage)
    const existing = await findMatchBetween(pair.unknownSampleId, pair.matchedSampleId) // age save kora ache kina

    return res.status(200).json({
      success: true,
      comparison: {
        unknownSampleId: pair.unknownSampleId,
        matchedSampleId: pair.matchedSampleId,
        unknownProfileCode: result.unknown_code,
        matchedProfileCode: result.matched_code,
        codeLength: Number(result.max_length),
        matchingPositions: Number(result.matching_positions),
        similarityPercentage: similarity,
        confidenceLevel: confidenceFor(similarity),
        existingMatchId: existing?.match_id ?? null,
      },
    })
  } catch (error) {
    console.error('Compare DNA samples error:', error)
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}

// POST /api/dna-matches — match record create
// Option 1: similarity na dile SQL diye compute (Computed)
// Option 2: Admin/Officer similarityPercentage dile sheta use (Manual)
export async function createMatch(req, res) {
  try {
    const body = req.body || {}
    const user = req.session.user

    const pair = await validatePair(body, user)
    if (pair.error) {
      return res.status(pair.error.status).json({ success: false, message: pair.error.message })
    }

    // Same jora age compare kora thakle notun record na
    if (await findMatchBetween(pair.unknownSampleId, pair.matchedSampleId)) {
      return res.status(409).json({ success: false, message: 'These two samples have already been compared.' })
    }

    const manualField = readField(body, 'similarity_percentage', 'similarityPercentage')
    const isManual = manualField.provided && manualField.value !== null && manualField.value !== ''

    let similarity
    if (isManual) {
      // Manual similarity shudhu Admin/Officer dite parbe — technician ke compute use korte hobe
      if (user.role === 'Lab Technician') {
        return res.status(403).json({ success: false, message: 'Only Admin and Officer can enter similarity manually.' })
      }

      similarity = Number(manualField.value)
      if (!Number.isFinite(similarity) || similarity < 0 || similarity > 100) {
        return res.status(400).json({ success: false, message: 'Similarity percentage must be a number between 0 and 100.' })
      }
      similarity = Math.round(similarity * 100) / 100 // DECIMAL(5,2) er jonno 2 decimal
    } else {
      const result = await compareProfileCodes(pair.unknownSampleId, pair.matchedSampleId)
      similarity = Number(result.similarity_percentage)
    }

    const match = await dbCreateMatch({
      unknownSampleId: pair.unknownSampleId,
      matchedSampleId: pair.matchedSampleId,
      similarityPercentage: similarity,
      confidenceLevel: confidenceFor(similarity),
      matchMethod: isManual ? 'Manual' : 'Computed',
    })

    return res.status(201).json({
      success: true,
      message: 'DNA match recorded successfully.',
      match: formatMatch(match),
    })
  } catch (error) {
    console.error('Create DNA match error:', error)
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'These two samples have already been compared.' })
    }
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}

// PUT /api/dna-matches/:id/status — review: Pending Review → Confirmed / Rejected
// (Issue 5 er trigger 'Confirmed' hole missing person ke 'Identified' korbe)
export async function reviewMatch(req, res) {
  try {
    const id = parseId(req.params.id)
    if (!id) {
      return res.status(400).json({ success: false, message: 'Invalid match id.' })
    }

    const matchStatus = typeof req.body?.matchStatus === 'string'
      ? req.body.matchStatus.trim()
      : typeof req.body?.match_status === 'string' ? req.body.match_status.trim() : ''

    if (!REVIEW_STATUSES.includes(matchStatus)) {
      return res.status(400).json({ success: false, message: 'Match status must be Confirmed or Rejected.' })
    }

    const existing = await findMatchById(id, req.session.user)
    if (!existing) {
      return res.status(404).json({ success: false, message: 'DNA match not found.' })
    }

    // Ekbar review hoye gele abar change kora jabe na
    if (existing.match_status !== 'Pending Review') {
      return res.status(409).json({ success: false, message: 'Only matches pending review can be updated.' })
    }

    await dbUpdateMatchStatus(id, matchStatus)
    const match = await findMatchById(id)

    return res.status(200).json({
      success: true,
      message: `DNA match ${matchStatus.toLowerCase()}.`,
      match: formatMatch(match),
    })
  } catch (error) {
    console.error('Review DNA match error:', error)
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}

// DELETE /api/dna-matches/:id — shudhu Admin, ar Confirmed match delete kora jabe na
export async function deleteMatch(req, res) {
  try {
    const id = parseId(req.params.id)
    if (!id) {
      return res.status(400).json({ success: false, message: 'Invalid match id.' })
    }

    const existing = await findMatchById(id)
    if (!existing) {
      return res.status(404).json({ success: false, message: 'DNA match not found.' })
    }

    // Confirmed match identification er proof — delete kora jabe na
    if (existing.match_status === 'Confirmed') {
      return res.status(409).json({ success: false, message: 'Confirmed matches cannot be deleted.' })
    }

    await dbDeleteMatch(id)

    return res.status(200).json({ success: true, message: 'DNA match deleted successfully.' })
  } catch (error) {
    console.error('Delete DNA match error:', error)
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}
```

## 4.6 `backend/routes/dnaMatchRoutes.js` (new)

```js
import express from 'express'

import {
  listMatches,
  getMatch,
  compareSamples,
  createMatch,
  reviewMatch,
  deleteMatch,
} from '../controllers/dnaMatchController.js'
import { requireAuth } from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'

const router = express.Router()

// Tinjonei match dekhte parbe (controller role onujayi filter kore)
router.get('/', requireAuth, requireRole('Admin', 'Officer', 'Lab Technician'), listMatches)
router.get('/:id', requireAuth, requireRole('Admin', 'Officer', 'Lab Technician'), getMatch)

// Technician/officer/admin duita sample select kore comparison run korte parbe
router.post('/compare', requireAuth, requireRole('Admin', 'Officer', 'Lab Technician'), compareSamples)
router.post('/', requireAuth, requireRole('Admin', 'Officer', 'Lab Technician'), createMatch)

// Match confirm/reject — investigation er decision, tai shudhu Admin + Officer
router.put('/:id/status', requireAuth, requireRole('Admin', 'Officer'), reviewMatch)

// Vul match record delete — shudhu Admin
router.delete('/:id', requireAuth, requireRole('Admin'), deleteMatch)

export default router
```

## 4.7 `backend/server.js` (modified)

```diff
@@ -19,6 +19,7 @@ import familyMemberRoutes from './routes/familyMemberRoutes.js';
 import reportRoutes from './routes/reportRoutes.js'
 import adminStatsRoutes from './routes/adminStatsRoutes.js'
 import dnaSampleRoutes from './routes/dnaSampleRoutes.js' // DNA Sample module (Member 1 - Issue 1)
+import dnaMatchRoutes from './routes/dnaMatchRoutes.js' // DNA Match module (Member 1 - Issue 4)
 
 const app = express()
 
@@ -59,6 +60,7 @@ app.use('/api/family-members', familyMemberRoutes);
 app.use('/api/reports', reportRoutes)
 app.use('/api/admin/counts', adminStatsRoutes)
 app.use('/api/dna-samples', dnaSampleRoutes) // DNA sample CRUD endpoints
+app.use('/api/dna-matches', dnaMatchRoutes) // DNA comparison + match endpoints
 
 async function startServer() {
   try {
```

---

## 4.8 `frontend/src/services/dnaService.js` (modified)

The mock `USE_MOCK_MATCHES`, `isMockDna` and `buildMatches` were removed. `getMatchesByPerson` / `getMatchesByCase` now call the real API, so the **Missing Person Details → DNA Matches tab now shows real data**.

```diff
@@ -1,26 +1,6 @@
 import api from './api'
 
-// dnaService: DNA sample gulo ekhon real backend (/api/dna-samples) theke ashe.
-// DNA match API Issue 4 e toiri hobe — totokkhon match gulo mock thakbe.
-const USE_MOCK_MATCHES = true
-
-// Match data ekhono mock kina (MatchesList e "(Sample data)" label dekhanor jonno)
-export const isMockDna = () => USE_MOCK_MATCHES
-
-function buildMatches(id) {
-  const matchKey = id ?? 'ANY'
-  const seed = Number(id) || 1
-  const similarity = 70 + (seed * 7) % 30
-  return [{
-    match_id: `MOCK-M-${matchKey}-1`,
-    unknown_sample_id: `MOCK-S-${matchKey}-1`,
-    matched_sample_id: `MOCK-S-${matchKey}-2`,
-    similarity_percentage: similarity,
-    confidence_level: similarity >= 90 ? 'High' : similarity >= 80 ? 'Medium' : 'Low',
-    match_date: '2026-09-01',
-    match_status: 'Pending Review',
-  }]
-}
+// dnaService: DNA sample (/api/dna-samples) ar DNA match (/api/dna-matches) — duitai real backend theke ashe.
 
 // ---------- DNA Samples (real API) ----------
 
@@ -100,26 +80,55 @@ export async function getTechnicians() {
   return response.data.data ?? []
 }
 
-// ---------- DNA Matches (Issue 4 porjonto mock) ----------
+// ---------- DNA Matches (real API — Issue 4) ----------
 
-export async function getMatchesByPerson(personId) {
-  if (USE_MOCK_MATCHES) {
-    return Promise.resolve(buildMatches(personId))
-  }
+// Match list — params: { status, confidence, person_id, case_id, sample_id }
+export async function getMatches(params = {}) {
+  const response = await api.get('/dna-matches', { params })
+  return response.data.matches ?? []
+}
 
-  // TODO: Member 1 - Issue 4 e /api/dna-matches toiri hole connect hobe
-  throw new Error('dnaService: dna matches API not implemented')
+// Ekta match er details
+export async function getMatchById(id) {
+  const response = await api.get(`/dna-matches/${id}`)
+  return response.data.match
 }
 
+// Duita sample compare (save kore na) — { unknownSampleId, matchedSampleId }
+export async function compareSamples(data) {
+  const response = await api.post('/dna-matches/compare', data)
+  return response.data.comparison
+}
+
+// Match save — similarityPercentage dile Manual (Admin/Officer), na dile Computed
+export async function createMatch(data) {
+  const response = await api.post('/dna-matches', data)
+  return response.data.match
+}
+
+// Review: 'Confirmed' ba 'Rejected'
+export async function updateMatchStatus(id, matchStatus) {
+  const response = await api.put(`/dna-matches/${id}/status`, { matchStatus })
+  return response.data.match
+}
+
+// Match delete (Admin)
+export async function deleteMatch(id) {
+  const response = await api.delete(`/dna-matches/${id}`)
+  return response.data
+}
+
+// Missing person details page er DNA Matches tab er jonno
+export async function getMatchesByPerson(personId) {
+  return getMatches({ person_id: personId })
+}
+
+// Case details page er DNA Matches section er jonno
 export async function getMatchesByCase(caseId) {
-  if (USE_MOCK_MATCHES) {
-    return Promise.resolve(buildMatches(caseId))
-  }
-  throw new Error('dnaService: dna matches API not implemented')
+  return getMatches({ case_id: caseId })
 }
 
 export default {
-  isMockDna,
   getSamples,
   getSampleById,
   createSample,
@@ -132,6 +141,12 @@ export default {
   getLabSummary,
   getLabs,
   getTechnicians,
+  getMatches,
+  getMatchById,
+  compareSamples,
+  createMatch,
+  updateMatchStatus,
+  deleteMatch,
   getMatchesByPerson,
   getMatchesByCase,
 }
```

## 4.9 `frontend/src/components/MatchesList.jsx` (modified)

```jsx
import React from 'react'
import { Link } from 'react-router-dom'
import { StatusBadge } from './Ui'

// Match gulo ekhon real API (/api/dna-matches) theke ashe, tai "(Sample data)" mock label ar lagbe na
// Match ID te click korle match details page e jabe
export default function MatchesList({ matches = [] }) {
  if (!matches || !matches.length) return <div className="alert alert-secondary">No DNA matches available.</div>

  return (
    <div>
      <div className="mb-2 small text-muted">DNA Matches</div>
      <div className="table-responsive">
        <table className="table table-sm">
          <thead>
            <tr><th>Match</th><th>Unknown</th><th>Matched</th><th>Similarity</th><th>Confidence</th><th>Date</th><th>Status</th></tr>
          </thead>
          <tbody>
            {matches.map(m => (
              <tr key={m.match_id}>
                <td><Link to={`/dna-matches/${m.match_id}`}>#{m.match_id}</Link></td>
                <td>#{m.unknown_sample_id}{m.unknownSample && <small className="d-block text-secondary">{m.unknownSample.provider}</small>}</td>
                <td>#{m.matched_sample_id}{m.matchedSample && <small className="d-block text-secondary">{m.matchedSample.provider}</small>}</td>
                <td>{m.similarity_percentage}%</td>
                <td><StatusBadge value={m.confidence_level}/></td>
                <td>{m.match_date}</td>
                <td><StatusBadge value={m.match_status}/></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

## 4.10 `frontend/src/pages/Laboratory.jsx` (modified)

**Other changes in this file:**

- the imports now include the match functions from `dnaService`;
- `import { useData }` and the mock helpers `sampleOwner`, `technicianLab`, `labCanAccessSample`, `describeSample`, `NotFound` and `AccessDenied` were **removed**;
- `SampleDetails` has a new **Compare** button for analyzed evidence samples, linking to `/dna-matches/new?unknownSampleId=ID`:

```jsx
{/* Analyzed evidence sample hole shorashori comparison shuru (Issue 4) */}
{sample.status === 'Analyzed' && !sample.familyId && <Link className="btn btn-outline-primary" to={`/dna-matches/new?unknownSampleId=${sample.id}`}>Compare</Link>}
```

**New match module code:**

| Component | What it does |
|---|---|
| `CodeComparison` | Shows both profile codes character by character. **Green** means the same character at that position, **red** means different. It shows on screen what the SQL comparison calculates |
| `Matches()` | Real list (respects `?personId=`). Client-side search + Confidence/Review filters. Shows provider names, similarity, method and status. **New Comparison** button |
| `MatchForm()` | Loads **analyzed** samples in the user's scope. Unknown dropdown = samples with no family link. Matched dropdown = any other sample. **Run Comparison** = preview with similarity, positions, confidence and `CodeComparison`, and warns if the pair already exists. Admin/Officer get a **manual similarity** checkbox (Option 2). **Save Match** goes to the details page |
| `MatchDetails()` | Hero card (unknown ↔ similarity ↔ matched). Compared samples with links and the code comparison. Match record (date, method, confidence, status). **Confirm / Reject** for Admin/Officer while Pending Review (the confirm dialog warns that the person will be marked Identified, which is Phase 5). **Delete** for Admin unless Confirmed. Technicians see person names without links |

```jsx
// ---------- DNA Match module (real API — Member 1 Issue 4) ----------

const MATCH_STATUSES = ['Pending Review', 'Confirmed', 'Rejected']
const CONFIDENCE_LEVELS = ['High', 'Medium', 'Low']

// Sample er short description: "#12 — Rafiqul Islam (Father)"
const sampleLabel = sample => `#${sample.id} — ${sampleProvider(sample)} · ${sample.sampleType} · ${sample.dnaProfileCode}`

// Duita profile code position-by-position dekhay — je position e character mile sheta shobuj
// (backend er SQL comparison je vabe kaj kore, UI te shetai visually bojhano)
function CodeComparison({ first, second }) {
  const length = Math.max(first?.length || 0, second?.length || 0)
  const positions = Array.from({ length }, (_, index) => index)
  const cell = (char, same) => ({ display: 'inline-block', width: '1.6rem', textAlign: 'center', fontFamily: 'monospace', fontWeight: 600, borderRadius: 4, margin: 1, padding: '2px 0', background: same ? '#d1e7dd' : '#f8d7da' })
  return (
    <div className="overflow-auto">
      {[first, second].map((code, row) => (
        <div key={row} className="text-nowrap">
          {positions.map(index => {
            const same = first?.[index] !== undefined && first?.[index] === second?.[index]
            return <span key={index} style={cell(code?.[index], same)}>{code?.[index] ?? '·'}</span>
          })}
        </div>
      ))}
    </div>
  )
}

// DNA match list page — backend role onujayi filter kore pathay
export function Matches() {
  const { role } = useAuth()
  const [params] = useSearchParams()
  const linkedPerson = params.get('personId') || '' // missing person page theke ashle shudhu tar match
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState({ confidence: '', status: '' })

  useEffect(() => {
    let mounted = true
    setLoading(true)
    getMatches(linkedPerson ? { person_id: linkedPerson } : {})
      .then(rows => { if (mounted) setMatches(rows) })
      .catch(requestError => { if (mounted) setError(errorMessage(requestError, 'Failed to load DNA matches.')) })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [linkedPerson])

  // Search (sample id, provider, person name) + dropdown filter client side e
  const rows = useMemo(() => matches.filter(item =>
    search({ id: item.id, a: item.unknownSample.provider, b: item.matchedSample.provider, pa: item.unknownSample.personName, pb: item.matchedSample.personName, sa: item.unknownSampleId, sb: item.matchedSampleId }, query) &&
    (!filters.confidence || item.confidenceLevel === filters.confidence) &&
    (!filters.status || item.matchStatus === filters.status)
  ), [matches, query, filters])

  return (
    <>
      <PageHeader
        title="DNA Matches"
        subtitle={linkedPerson ? 'DNA comparison results tied to the selected missing person.' : role === 'Lab Technician' ? 'Comparison results involving samples from your laboratory.' : 'DNA profile comparison results for investigation review.'}
        action={<Link to="/dna-matches/new" className="btn btn-primary">New Comparison</Link>}
      />
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      <SearchFilters onSearchChange={setQuery} onClear={() => setFilters({ confidence: '', status: '' })}>
        <Filter label="Confidence" value={filters.confidence} values={CONFIDENCE_LEVELS} onChange={confidence => setFilters({ ...filters, confidence })}/>
        <Filter label="Review" value={filters.status} values={MATCH_STATUSES} onChange={status => setFilters({ ...filters, status })}/>
      </SearchFilters>
      <div className="card">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead><tr><th>Match</th><th>Unknown Sample</th><th>Matched Sample</th><th>Similarity</th><th>Confidence</th><th>Method</th><th>Match Date</th><th>Status</th><th/></tr></thead>
            <tbody>
              {loading && <tr><td colSpan="9" className="text-center text-secondary py-4">Loading DNA matches...</td></tr>}
              {!loading && rows.map(item => (
                <tr key={item.id}>
                  <td className="fw-semibold">#{item.id}</td>
                  <td>#{item.unknownSampleId}<small className="d-block text-secondary">{item.unknownSample.provider}</small></td>
                  <td>#{item.matchedSampleId}<small className="d-block text-secondary">{item.matchedSample.provider}</small></td>
                  <td className="fw-bold">{item.similarityPercentage}%</td>
                  <td><StatusBadge value={item.confidenceLevel}/></td>
                  <td>{item.matchMethod}</td>
                  <td>{item.matchDate}</td>
                  <td><StatusBadge value={item.matchStatus}/></td>
                  <td><TableAction to={`/dna-matches/${item.id}`}/></td>
                </tr>
              ))}
              {!loading && !rows.length && <tr><td colSpan="9" className="text-center text-secondary py-4">No matching DNA comparisons found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

// Notun comparison page: duita analyzed sample select → Run Comparison (preview) → Save Match
// Option 1: SQL compute (default), Option 2: Admin/Officer manual similarity
export function MatchForm() {
  const { role } = useAuth()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [samples, setSamples] = useState([])
  const [form, setForm] = useState({ unknownSampleId: params.get('unknownSampleId') || '', matchedSampleId: '', manual: false, similarityPercentage: '' })
  const [comparison, setComparison] = useState(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const canEnterManually = role === 'Admin' || role === 'Officer' // Option 2 shudhu Admin/Officer

  // Shudhu analyzed sample (profile code ache) load — backend role scope o apply kore
  useEffect(() => {
    let mounted = true
    getSamples({ status: 'Analyzed' })
      .then(rows => { if (mounted) setSamples(rows.filter(sample => sample.dnaProfileCode)) })
      .catch(requestError => { if (mounted) setError(errorMessage(requestError, 'Failed to load analyzed samples.')) })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const change = event => {
    const { name, value, type, checked } = event.target
    setForm({ ...form, [name]: type === 'checkbox' ? checked : value })
    if (name === 'unknownSampleId' || name === 'matchedSampleId') setComparison(null) // sample change hole purono result baad
  }

  const pairPayload = () => ({ unknownSampleId: Number(form.unknownSampleId), matchedSampleId: Number(form.matchedSampleId) })

  // Preview — database e save hoy na
  const runComparison = async () => {
    try {
      setWorking(true)
      setError('')
      setComparison(await compareSamples(pairPayload()))
    } catch (requestError) {
      setError(errorMessage(requestError, 'Comparison failed.'))
    } finally {
      setWorking(false)
    }
  }

  const save = async event => {
    event.preventDefault()
    try {
      setWorking(true)
      setError('')
      const payload = pairPayload()
      if (form.manual) payload.similarityPercentage = Number(form.similarityPercentage) // Option 2
      const match = await createMatch(payload)
      nav(`/dna-matches/${match.id}`)
    } catch (requestError) {
      setError(errorMessage(requestError, 'Failed to save the DNA match.'))
    } finally {
      setWorking(false)
    }
  }

  // Unknown = evidence/missing person sample (family reference na), Matched = je kono onno analyzed sample
  const unknownOptions = samples.filter(sample => !sample.familyId)
  const matchedOptions = samples.filter(sample => String(sample.id) !== form.unknownSampleId)
  const bothSelected = form.unknownSampleId && form.matchedSampleId

  if (loading) return <div className="card"><div className="card-body text-center text-secondary py-4">Loading analyzed samples...</div></div>

  return (
    <>
      <PageHeader title="New DNA Comparison" subtitle="Select an unknown/evidence sample and a reference sample, compare their DNA profile codes, and record the match."/>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      <form className="card mb-4" onSubmit={save}>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label">Unknown / Evidence Sample</label>
              <select name="unknownSampleId" className="form-select" value={form.unknownSampleId} onChange={change} required>
                <option value="">Select unknown sample</option>
                {unknownOptions.map(sample => <option key={sample.id} value={String(sample.id)}>{sampleLabel(sample)}</option>)}
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label">Matched / Reference Sample</label>
              <select name="matchedSampleId" className="form-select" value={form.matchedSampleId} onChange={change} required>
                <option value="">Select reference sample</option>
                {matchedOptions.map(sample => <option key={sample.id} value={String(sample.id)}>{sampleLabel(sample)}</option>)}
              </select>
            </div>
            {canEnterManually && (
              <div className="col-12">
                <div className="form-check">
                  <input id="manual-similarity" name="manual" type="checkbox" className="form-check-input" checked={form.manual} onChange={change}/>
                  <label htmlFor="manual-similarity" className="form-check-label">Enter similarity percentage manually</label>
                </div>
              </div>
            )}
            {form.manual && (
              <div className="col-md-4">
                <label className="form-label">Similarity Percentage</label>
                <input name="similarityPercentage" type="number" min="0" max="100" step="0.01" className="form-control" value={form.similarityPercentage} onChange={change} required/>
              </div>
            )}
          </div>
          {!unknownOptions.length && <p className="text-secondary small mt-3 mb-0">No analyzed evidence samples are available in your scope yet.</p>}
        </div>
        <div className="card-footer bg-white text-end">
          <Link to="/dna-matches" className="btn btn-light me-2">Cancel</Link>
          {!form.manual && <button type="button" className="btn btn-outline-primary me-2" disabled={!bothSelected || working} onClick={runComparison}>Run Comparison</button>}
          <button className="btn btn-primary" disabled={!bothSelected || working || Boolean(comparison?.existingMatchId)}>{working ? 'Working...' : 'Save Match'}</button>
        </div>
      </form>

      {/* Comparison preview result */}
      {comparison && (
        <Card title="Comparison result">
          {comparison.existingMatchId && <div className="alert alert-warning">These samples were already compared. <Link to={`/dna-matches/${comparison.existingMatchId}`}>View match #{comparison.existingMatchId}</Link></div>}
          <div className="d-flex flex-wrap gap-4 mb-3">
            <span>Similarity<b className="d-block fs-4">{comparison.similarityPercentage}%</b></span>
            <span>Matching positions<b className="d-block fs-4">{comparison.matchingPositions} / {comparison.codeLength}</b></span>
            <span>Confidence<b className="d-block mt-1"><StatusBadge value={comparison.confidenceLevel}/></b></span>
          </div>
          <CodeComparison first={comparison.unknownProfileCode} second={comparison.matchedProfileCode}/>
        </Card>
      )}
    </>
  )
}

// Match details page — Admin/Officer review (Confirm/Reject) korte pare
export function MatchDetails() {
  const { id } = useParams()
  const { role } = useAuth()
  const nav = useNavigate()
  const [match, setMatch] = useState(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    setLoading(true)
    getMatchById(id)
      .then(row => { if (mounted) setMatch(row) })
      .catch(requestError => { if (mounted) setError(errorMessage(requestError, 'Failed to load the DNA match.')) })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [id])

  // Confirm / Reject — Confirmed hole (Issue 5 trigger) missing person 'Identified' hobe
  const review = async matchStatus => {
    const note = matchStatus === 'Confirmed' ? ' This will mark the matched missing person as Identified.' : ''
    if (!window.confirm(`Mark match #${match.id} as ${matchStatus}?${note}`)) return
    try {
      setWorking(true)
      setError('')
      setMatch(await updateMatchStatus(match.id, matchStatus))
    } catch (requestError) {
      setError(errorMessage(requestError, 'Failed to update the match.'))
    } finally {
      setWorking(false)
    }
  }

  const remove = async () => {
    if (!window.confirm(`Delete match #${match.id}? This action cannot be undone.`)) return
    try {
      await deleteMatch(match.id)
      nav('/dna-matches')
    } catch (requestError) {
      setError(errorMessage(requestError, 'Failed to delete the match.'))
    }
  }

  if (loading) return <div className="card"><div className="card-body text-center text-secondary py-4">Loading DNA match...</div></div>
  if (!match) return <div className="alert alert-warning">{error || 'This DNA match could not be found.'}</div>

  const canReview = (role === 'Admin' || role === 'Officer') && match.matchStatus === 'Pending Review'
  const canDelete = role === 'Admin' && match.matchStatus !== 'Confirmed'
  const isTechnician = role === 'Lab Technician' // technician investigation (person) page e link pabe na
  const personLink = sample => isTechnician ? sample.personName : <Link to={`/missing-persons/${sample.personId}`}>{sample.personName}</Link>

  return (
    <>
      <PageHeader
        title={`DNA Match #${match.id}`}
        subtitle="DNA profile comparison result"
        action={<>
          {canReview && <button type="button" className="btn btn-success" disabled={working} onClick={() => review('Confirmed')}>Confirm Match</button>}
          {canReview && <button type="button" className="btn btn-outline-danger" disabled={working} onClick={() => review('Rejected')}>Reject Match</button>}
          {canDelete && <button type="button" className="btn btn-outline-secondary" onClick={remove}>Delete</button>}
        </>}
      />
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      <div className="match-hero card mb-4">
        <div className="card-body">
          <div><span className="eyebrow">UNKNOWN SAMPLE</span><h3>#{match.unknownSampleId}</h3><small>{match.unknownSample.provider}</small></div>
          <div className="match-score"><b>{match.similarityPercentage}%</b><span>Similarity</span><StatusBadge value={`${match.confidenceLevel} Confidence`}/></div>
          <div className="text-lg-end"><span className="eyebrow">MATCHED SAMPLE</span><h3>#{match.matchedSampleId}</h3><small>{match.matchedSample.provider}</small></div>
        </div>
      </div>
      <div className="row g-4">
        <div className="col-md-6">
          <Card title="Compared samples">
            <p>Unknown: <Link to={`/dna-samples/${match.unknownSampleId}`}>#{match.unknownSampleId}</Link> — {match.unknownSample.sampleType}, {match.unknownSample.labName || '—'}<br/><small className="text-secondary">Investigation: {personLink(match.unknownSample)}</small></p>
            <p>Matched: <Link to={`/dna-samples/${match.matchedSampleId}`}>#{match.matchedSampleId}</Link> — {match.matchedSample.sampleType}, {match.matchedSample.labName || '—'}<br/><small className="text-secondary">{match.matchedSample.isFamilyReference ? 'Family reference for' : 'Sample of'}: {personLink(match.matchedSample)} ({match.matchedSample.personStatus})</small></p>
            <b className="d-block mb-2">Profile code comparison</b>
            <CodeComparison first={match.unknownSample.profileCode} second={match.matchedSample.profileCode}/>
          </Card>
        </div>
        <div className="col-md-6">
          <Card title="Match record">
            <p>Match date: <b>{match.matchDate}</b></p>
            <p>Method: <b>{match.matchMethod === 'Manual' ? 'Manual similarity entry' : 'Computed from profile codes'}</b></p>
            <p>Confidence: <StatusBadge value={match.confidenceLevel}/></p>
            <p className="mb-0">Review status: <StatusBadge value={match.matchStatus}/></p>
          </Card>
        </div>
      </div>
    </>
  )
}

function Filter({ label, value, values, onChange }) { return <div className="col-md-2"><label className="form-label">{label}</label><select className="form-select" value={value} onChange={event => onChange(event.target.value)}><option value="">All {label.toLowerCase()}s</option>{values.map(item => <option key={item}>{item}</option>)}</select></div> }
function Card({ title, children }) { return <div className="card h-100"><div className="card-header bg-white"><strong>{title}</strong></div><div className="card-body">{children}</div></div> }
```

## 4.11 `frontend/src/routes/AppRoutes.jsx` (modified)

```diff
@@ -22,6 +22,7 @@ import IntersectionReport from '../pages/IntersectionReport'
 import {
   DNAAnalysis,
   MatchDetails,
+  MatchForm,
   Matches,
   SampleDetails,
   SampleForm,
@@ -258,6 +259,16 @@ export default function AppRoutes() {
           }
         />
 
+        {/* Notun DNA comparison (Issue 4) — tinjonei duita sample compare korte pare */}
+        <Route
+          path="dna-matches/new"
+          element={
+            <ProtectedRoute allowedRoles={['Admin', 'Officer', 'Lab Technician']}>
+              <MatchForm />
+            </ProtectedRoute>
+          }
+        />
+
         <Route
           path="dna-matches/:id"
           element={
```

---

## Phase 4 testing

**SQL:** `dna_matches.sql` ran on local MySQL. Comparing seed samples 1 and 2 gave **10/11 = 90.91% High**. The spec example `ABC12345` vs `ABC12346` gave **87.50%**. The officer, technician and person views returned the correct rows. The review UPDATE worked. The test rows were deleted. The constraints were checked directly: a duplicate pair gave `ER_DUP_ENTRY`, and similarity 150 gave `ER_CHECK_CONSTRAINT_VIOLATED`.

**API:** tested with curl as Admin, Officer 1 (case: John Doe), Officer 2 (case: Jane Smith), Technician 1 (lab 1) and Technician 4 (lab 3):

| Test | Result |
|---|---|
| No login | 401 |
| List: Admin / Officer 1 / Officer 2 / Tech 1 / Tech 4 | 2,1 / 2,1 / 2 / 2,1 / (none) |
| Filters `person_id`, `case_id`, `status`, `confidence`; invalid status | Correct rows; 400 |
| Officer 2 / Tech 4 open match 1 | 404 |
| Compare 1 vs 2 | 90.91% High, 10/11, `existingMatchId: 1` |
| Compare 6 vs 1 (cross-case) | 27.27% Low |
| Same sample / family reference as unknown / unanalyzed sample / missing id | 400 each |
| Officer 2 compares Officer 1's samples | 404 |
| Admin creates 6 vs 1 (computed) | 201 Computed 27.27% Low |
| Create 1 vs 6 (reversed) / 1 vs 2 (seeded) | 409 / 409 |
| Admin manual 81.456 | 201 **Manual 81.46% Medium** |
| Admin manual 150 / "abc" | 400 / 400 |
| Tech analyzes sample 3, then tries manual 99 | 403 "Only Admin and Officer ..." |
| Tech creates 1 vs 3 (computed) | 201 90.91% High |
| Tech 4 uses a lab-1 sample | 404 |
| Tech reviews | 403 |
| Officer: invalid status / Officer 2 reviews / Officer 1 confirms / confirms again | 400 / 404 / **200 Confirmed** / 409 |
| Officer deletes | 403 |
| Admin deletes a Confirmed match / a Pending match | 409 / 200 |

Afterwards the test matches were deleted, match 1 was set back to Pending Review, sample 3 was restored to its seed values, and the test users were removed.

**Frontend:** `oxlint` found no issues and `vite build` succeeded. `Laboratory.jsx` has no mock or `DataContext` code left. The pages were not clicked through in a browser.

## Known gaps after Phase 4

- Confirming a match does **not yet** change the missing person's status. The SQL trigger comes in Phase 5.
- The Officer and Lab Technician dashboards (`Dashboards.jsx`) still show mock DNA counts (Phase 7).

---

# Phase 5 — Issue 5: SQL Trigger (Automatic Identification Update)

## Goal

After a DNA match is confirmed, the missing person's status should update **automatically in the database**:

```
dna_matches.match_status = 'Confirmed'   ──(trigger)──>   missing_persons.status = 'Identified'
```

**Dependency:** this uses `dna_samples` (Issue 1) and `dna_matches` (Issue 4), both finished.

## How it works

| Question | Answer |
|---|---|
| **Which missing person?** | The person linked to the **matched (reference) sample**: `dna_samples.person_id` where `sample_id = NEW.matched_sample_id`. Example: John Doe's evidence (sample 1) vs his father's reference (sample 2) is confirmed. Sample 2 belongs to person 1, so **John Doe becomes Identified** |
| **When does it fire?** | `AFTER UPDATE`: only when the status **changes to** `Confirmed` (`NEW = 'Confirmed' AND OLD <> 'Confirmed'`). `AFTER INSERT`: when a row is inserted already `Confirmed` |
| **Why two triggers?** | The app always inserts `Pending Review` and then updates to `Confirmed`, which is the UPDATE trigger. The INSERT trigger covers matches inserted directly as `Confirmed` (raw SQL, imports), so the rule holds however the data gets in |
| **What if the person is already Identified?** | `AND status <> 'Identified'` skips the update, so nothing changes needlessly |
| **What about Rejected?** | Nothing happens. The `IF` only checks for `Confirmed` |
| **Backend code needed?** | **None for the rule itself.** The existing `PUT /api/dna-matches/:id/status` runs the UPDATE and MySQL runs the trigger. The backend only reads the result back to show a message |

## Files changed

| File | Type | What changed |
|---|---|---|
| `database/sql/trigger.sql` | New | Both triggers + `SHOW TRIGGERS` + 3 tests that restore the data afterwards |
| `database/schema.sql` | Modified | Creates both triggers on a fresh setup (`DROP TRIGGER IF EXISTS` + `DELIMITER` blocks, same pattern as the existing procedures) |
| `backend/controllers/dnaMatchController.js` | Modified | `reviewMatch` reads the fresh row after the update and says who was identified |
| `frontend/src/pages/Laboratory.jsx` | Modified | `MatchDetails` shows a green notice after review ("... has been automatically marked as Identified") |

---

## 5.1 `database/sql/trigger.sql` (new)

| Part | What it does |
|---|---|
| `DROP TRIGGER IF EXISTS` ×2 | The file can be re-run without errors |
| `trg_dna_match_confirmed_update` | **AFTER UPDATE ON dna_matches FOR EACH ROW**. If the status just became `Confirmed`, it sets the matched sample's missing person to `Identified` |
| `trg_dna_match_confirmed_insert` | **AFTER INSERT ON dna_matches FOR EACH ROW**. Same rule for rows inserted as `Confirmed` |
| `SHOW TRIGGERS` | Shows that both triggers exist |
| Test 1 (UPDATE) | Saves the current values in `@old_*` variables, confirms seed match 1, and shows John Doe going from Under Investigation to **Identified** |
| Test 2 (Rejected) | Inserts a Pending match for Jane, rejects it, and shows her status **doesn't change** |
| Test 3 (INSERT) | Inserts a match already `Confirmed` against Jane's brother's reference, and Jane becomes **Identified** |
| Restore | Deletes the test matches and puts back the saved statuses, leaving the seed data unchanged |

```sql
-- =========================================================
-- ForenTrace: SQL Trigger — Automatic Identification Update (Member 1 - Issue 5)
-- File: database/sql/trigger.sql
--
-- Kaj: dna_matches.match_status = 'Confirmed' hole
--      automatic vabe missing_persons.status = 'Identified' hoye jabe.
--
-- Kon missing person? → matched_sample_id (reference sample) je missing person er
--   Example: John Doe er evidence (sample 1) vs John er father er reference (sample 2)
--            match Confirmed → sample 2 er person_id = 1 → John Doe 'Identified'
--
-- Duita trigger:
--   1. AFTER UPDATE — Admin/Officer review kore 'Pending Review' → 'Confirmed' korle (normal flow)
--   2. AFTER INSERT — keu shorashori 'Confirmed' status diye match insert korle (raw SQL / import)
--
-- Ei file-er shob query age MySQL-e test kora hoyeche. Backend code change lage na —
-- PUT /api/dna-matches/:id/status 'Confirmed' korlei database nijei trigger chalay.
-- =========================================================

USE forentrace_db;

-- Age theke thakle drop (file abar run korle error hobe na)
DROP TRIGGER IF EXISTS trg_dna_match_confirmed_update;
DROP TRIGGER IF EXISTS trg_dna_match_confirmed_insert;

DELIMITER //

-- 1. AFTER UPDATE trigger: match review kore Confirmed korle
CREATE TRIGGER trg_dna_match_confirmed_update
AFTER UPDATE ON dna_matches
FOR EACH ROW
BEGIN
    -- Shudhu tokhon-i jokhon status notun kore 'Confirmed' holo (age Confirmed chilo na)
    IF NEW.match_status = 'Confirmed' AND OLD.match_status <> 'Confirmed' THEN
        UPDATE missing_persons
        SET status = 'Identified'
        WHERE person_id = (
            -- Matched (reference) sample er missing person
            SELECT s.person_id
            FROM dna_samples s
            WHERE s.sample_id = NEW.matched_sample_id
        )
          AND status <> 'Identified'; -- age theke Identified hole abar update lagbe na
    END IF;
END //

-- 2. AFTER INSERT trigger: shorashori 'Confirmed' match insert korle
CREATE TRIGGER trg_dna_match_confirmed_insert
AFTER INSERT ON dna_matches
FOR EACH ROW
BEGIN
    IF NEW.match_status = 'Confirmed' THEN
        UPDATE missing_persons
        SET status = 'Identified'
        WHERE person_id = (
            SELECT s.person_id
            FROM dna_samples s
            WHERE s.sample_id = NEW.matched_sample_id
        )
          AND status <> 'Identified';
    END IF;
END //

DELIMITER ;


-- 3. Trigger gulo toiri hoyeche kina dekha
SHOW TRIGGERS WHERE `Table` = 'dna_matches';


-- =========================================================
-- TEST (seed data use kore — shesh e shob kichu ager obosthay ferot jay)
-- =========================================================

-- Test 1: AFTER UPDATE — seed match 1 (sample 1 vs sample 2, John Doe) Confirm kora
-- Ager status mone rakhi jate test er por restore kora jay
SET @person_id = (SELECT s.person_id FROM dna_matches m JOIN dna_samples s ON s.sample_id = m.matched_sample_id WHERE m.match_id = 1);
SET @old_person_status = (SELECT status FROM missing_persons WHERE person_id = @person_id);
SET @old_match_status = (SELECT match_status FROM dna_matches WHERE match_id = 1);

-- Before: John Doe er status
SELECT person_id, first_name, last_name, status AS status_before
FROM missing_persons
WHERE person_id = @person_id;

-- Match Confirm → trigger fire hobe
UPDATE dna_matches
SET match_status = 'Confirmed'
WHERE match_id = 1;

-- After: status 'Identified' hoye jawar kotha
SELECT person_id, first_name, last_name, status AS status_after_confirm
FROM missing_persons
WHERE person_id = @person_id;


-- Test 2: 'Rejected' korle trigger kichu kore na
-- (Jane Smith, person 2 — notun ekta Pending match banie sheta Reject kori)
SET @old_jane_status = (SELECT status FROM missing_persons WHERE person_id = 2);
INSERT INTO dna_matches (unknown_sample_id, matched_sample_id, similarity_percentage, confidence_level, match_date, match_status, match_method)
VALUES (6, 5, 45.45, 'Low', CURDATE(), 'Pending Review', 'Computed');
SET @reject_match_id = LAST_INSERT_ID();

UPDATE dna_matches SET match_status = 'Rejected' WHERE match_id = @reject_match_id;

SELECT person_id, first_name, status AS status_after_reject -- ager motoi thakbe
FROM missing_persons
WHERE person_id = 2;


-- Test 3: AFTER INSERT — shorashori 'Confirmed' match insert (sample 6 vs sample 4 → sample 4 = Jane er brother er reference)
INSERT INTO dna_matches (unknown_sample_id, matched_sample_id, similarity_percentage, confidence_level, match_date, match_status, match_method)
VALUES (6, 4, 95.00, 'High', CURDATE(), 'Confirmed', 'Manual');
SET @insert_match_id = LAST_INSERT_ID();

SELECT person_id, first_name, status AS status_after_confirmed_insert -- 'Identified' hobe
FROM missing_persons
WHERE person_id = 2;


-- Restore: test er shob change ferot (seed data jeno thik thake)
DELETE FROM dna_matches WHERE match_id IN (@reject_match_id, @insert_match_id);
UPDATE dna_matches SET match_status = @old_match_status WHERE match_id = 1;
UPDATE missing_persons SET status = @old_person_status WHERE person_id = @person_id;
UPDATE missing_persons SET status = @old_jane_status WHERE person_id = 2;

SELECT person_id, first_name, status AS status_restored
FROM missing_persons
ORDER BY person_id;
```

## 5.2 `database/schema.sql` (modified)

```diff
@@ -250,4 +250,35 @@ CREATE TABLE IF NOT EXISTS dna_matches (
     CONSTRAINT fk_match_matched_sample
         FOREIGN KEY (matched_sample_id) REFERENCES dna_samples(sample_id)
         ON DELETE CASCADE
-);
\ No newline at end of file
+);
+
+-- Trigger: DNA match Confirmed hole missing person automatic 'Identified' (Member 1 - Issue 5)
+-- Raw SQL + test query gulo: database/sql/trigger.sql
+DROP TRIGGER IF EXISTS trg_dna_match_confirmed_update;
+DROP TRIGGER IF EXISTS trg_dna_match_confirmed_insert;
+DELIMITER //
+CREATE TRIGGER trg_dna_match_confirmed_update
+AFTER UPDATE ON dna_matches
+FOR EACH ROW
+BEGIN
+    -- Pending Review/Rejected theke notun kore 'Confirmed' holei
+    IF NEW.match_status = 'Confirmed' AND OLD.match_status <> 'Confirmed' THEN
+        UPDATE missing_persons
+        SET status = 'Identified'
+        WHERE person_id = (SELECT s.person_id FROM dna_samples s WHERE s.sample_id = NEW.matched_sample_id)
+          AND status <> 'Identified';
+    END IF;
+END //
+CREATE TRIGGER trg_dna_match_confirmed_insert
+AFTER INSERT ON dna_matches
+FOR EACH ROW
+BEGIN
+    -- Shorashori 'Confirmed' match insert holeo
+    IF NEW.match_status = 'Confirmed' THEN
+        UPDATE missing_persons
+        SET status = 'Identified'
+        WHERE person_id = (SELECT s.person_id FROM dna_samples s WHERE s.sample_id = NEW.matched_sample_id)
+          AND status <> 'Identified';
+    END IF;
+END //
+DELIMITER ;
\ No newline at end of file
```

## 5.3 `backend/controllers/dnaMatchController.js` (modified)

`reviewMatch` already re-read the match after updating. Now it also checks `matched_person_status`, which the trigger has just changed, and puts it in the message: *"DNA match confirmed. John Doe is now marked as Identified."*

```diff
@@ -311,12 +311,20 @@ export async function reviewMatch(req, res) {
       return res.status(409).json({ success: false, message: 'Only matches pending review can be updated.' })
     }
 
+    // UPDATE er shathe shathe database trigger (trg_dna_match_confirmed_update — Issue 5)
+    // matched sample er missing person ke 'Identified' kore dey — ekhane alada code lage na
     await dbUpdateMatchStatus(id, matchStatus)
-    const match = await findMatchById(id)
+    const match = await findMatchById(id) // trigger er por fresh data (matched_person_status)
+
+    // Confirmed hole trigger er result response e janai
+    const identified = matchStatus === 'Confirmed' && match.matched_person_status === 'Identified'
+    const message = identified
+      ? `DNA match confirmed. ${match.matched_person_name} is now marked as Identified.`
+      : `DNA match ${matchStatus.toLowerCase()}.`
 
     return res.status(200).json({
       success: true,
-      message: `DNA match ${matchStatus.toLowerCase()}.`,
+      message,
       match: formatMatch(match),
     })
   } catch (error) {
```

## 5.4 `frontend/src/pages/Laboratory.jsx` (modified)

`MatchDetails` has a new `notice` state. After **Confirm Match**, if the returned `matchedSample.personStatus` is `Identified`, it shows a green alert. The "Compared samples" card also shows the person's new status right away.

```diff
@@ -720,6 +720,7 @@ export function MatchDetails() {
   const [loading, setLoading] = useState(true)
   const [working, setWorking] = useState(false)
   const [error, setError] = useState('')
+  const [notice, setNotice] = useState('') // review er por success message (trigger result)
 
   useEffect(() => {
     let mounted = true
@@ -738,7 +739,13 @@ export function MatchDetails() {
     try {
       setWorking(true)
       setError('')
-      setMatch(await updateMatchStatus(match.id, matchStatus))
+      setNotice('')
+      const updated = await updateMatchStatus(match.id, matchStatus)
+      setMatch(updated)
+      // Database trigger (Issue 5) matched person ke Identified korle sheta dekhano
+      setNotice(matchStatus === 'Confirmed' && updated.matchedSample.personStatus === 'Identified'
+        ? `Match confirmed. ${updated.matchedSample.personName} has been automatically marked as Identified.`
+        : `Match ${matchStatus.toLowerCase()}.`)
     } catch (requestError) {
       setError(errorMessage(requestError, 'Failed to update the match.'))
     } finally {
@@ -776,6 +783,7 @@ export function MatchDetails() {
         </>}
       />
       {error && <div className="alert alert-danger" role="alert">{error}</div>}
+      {notice && <div className="alert alert-success" role="status">{notice}</div>}
       <div className="match-hero card mb-4">
         <div className="card-body">
           <div><span className="eyebrow">UNKNOWN SAMPLE</span><h3>#{match.unknownSampleId}</h3><small>{match.unknownSample.provider}</small></div>
```

---

## Phase 5 testing

**SQL (`trigger.sql` on local MySQL 8.0):**

| Test | Result |
|---|---|
| `SHOW TRIGGERS` / `information_schema.TRIGGERS` | Both triggers exist (UPDATE/AFTER, INSERT/AFTER) |
| Confirm seed match 1 | John Doe: Under Investigation → **Identified** |
| Reject a new Pending match for Jane | Jane stays **Under Investigation** |
| Insert a match already `Confirmed` for Jane's reference | Jane → **Identified** |
| Restore section | John and Jane back to Under Investigation, match 1 back to Pending Review, test matches deleted |
| Re-run `schema.sql` | Triggers dropped and recreated without errors |

**API end to end (backend on a test port):**

| Step | Result |
|---|---|
| Before | `GET /missing-persons/1` → **Under Investigation**. `GET /missing-persons/statistics` → identified = **1** |
| Officer `PUT /dna-matches/1/status {"matchStatus":"Confirmed"}` | 200 "DNA match confirmed. **John Doe is now marked as Identified.**" |
| After | `GET /missing-persons/1` → **Identified**. Statistics identified = **2** |
| `GET /dna-matches/1` / `GET /dna-samples/2` | Confirmed / person status Identified |

The seed data was restored afterwards (match 1 Pending Review, John Doe Under Investigation) and the test users were removed.

**Frontend:** `oxlint` found no issues and `vite build` succeeded. The pages were not clicked through in a browser.

## Notes

- **Demo steps:** log in as Admin or Officer 1 → DNA Matches → **Match #1** → **Confirm Match** → the green notice appears → open John Doe in Missing Persons to see **Identified**.
- The trigger only changes `missing_persons.status`, as the issue specifies. The case's `case_status` / `identified_date` belong to Member 2's case module and are **not** changed.

---

# SQL File Coverage Update (after Phase 5)

## Why

The task requires that **all** database queries are written and tested as raw SQL in `database/sql/*.sql` **before** they go into the backend models. A review after Phase 5 found that a few statements the backend runs had not been written in the `.sql` files yet:

| Missing from the `.sql` files | Used by |
|---|---|
| Sample **search** (LIKE on name / family / lab / type / profile code) | `findAllSamples` (`?search=`) |
| Sample **filters** `status`, `family_id`, `lab_id`, `case_id` | `findAllSamples` |
| Lookups: **missing person exists**, **DNA lab exists** | `findPersonForSample`, `findLabForSample` |
| Match **filters** `status`, `confidence`, `case_id`, `sample_id` | `findAllMatches` |
| **Delete one match by id** | `deleteMatchById` |
| Some **columns**: sample query 5 lacked `person_status` / `case_officer_id`, and match query 3 lacked the unknown family/lab columns, `matched_person_status` and the matched lab | `sampleSelect`, `matchSelect` |

This update adds them. **No backend or frontend code changed.** The SQL files now contain every statement the models run.

## How the `.sql` files relate to the backend

1. Each query is written and **run in MySQL first** from `database/sql/*.sql`, using fixed example values (for example `WHERE family_id = 1`) or `@variables`.
2. The **same SQL** is then placed in the model file (`backend/models/*.js`). The fixed values are replaced with **`?` placeholders**, which `mysql2`'s `pool.execute(sql, params)` fills in from the request. This prevents SQL injection.
3. The backend does **not** read the `.sql` files at runtime. They are the tested source for the SQL, as the task specifies ("The final backend models should execute these SQL operations using `mysql2`").
4. `trigger.sql` is different: triggers are **installed in MySQL** (by `schema.sql`) and run automatically. No backend function calls them.

## Files changed

| File | What changed |
|---|---|
| `database/sql/dna_samples.sql` | Query 5 now has the same columns as the backend. **New queries 21–24:** search, the 6 filters (22a–f), person lookup, lab lookup |
| `database/sql/dna_matches.sql` | Query 3 now has the same columns as the backend's `matchSelect`. **New queries 11–12:** the 4 filters (11a–d), delete one match by id |

**Note on query 21 (search):** the first version used `@sample_search` in `LIKE` and failed with `ER_CANT_AGGREGATE_2COLLATIONS`. A MySQL user variable takes the connection's collation (`utf8mb4_unicode_ci`), which clashed with the table's `utf8mb4_0900_ai_ci`. The file now uses literal values (`LIKE '%Rafiqul%'`). The backend's `?` parameters are also bound as literals, which adapt to the column collation, so the backend never had this problem (the Phase 1 search test passed).

## Full mapping: every model query → its `.sql` file query

### `backend/models/dnaSampleModel.js` → `database/sql/dna_samples.sql`

| Model function / SQL piece | `.sql` query |
|---|---|
| `sampleSelect` (joined SELECT) | 2 (admin list), **5** (same columns) |
| `scopeCondition` Officer / Technician | 3 / 4 |
| `findAllSamples` search | **21** |
| `findAllSamples` filters status / person / family / lab / case / combined | **22a / 22b / 22c / 22d / 22e / 22f** |
| `findSampleById` | 5 |
| `createSample` | 1 |
| `updateSampleById` | 6 |
| `deleteSampleById` | 7 |
| `findPersonForSample` | **23** |
| `familyMemberBelongsToPerson` | 8a |
| `findLabForSample` | **24** |
| `technicianBelongsToLab` | 8b |
| `officerAssignedToPerson` | 8c |
| `findFamilyMemberForSample` | 9 |
| `createFamilySample` (INSERT ... SELECT) | 10 |
| `findFamilyDnaByPerson` | 11 |
| `findFamilyDnaSummary` | 12 |
| `findTechnicianForUser` | 14 |
| `findLabSampleSummary` | 16 |
| `updateSampleAnalysis` | 18 |

Queries 13, 17, 19 and 20 are test setup and cleanup. Query 15 (the technician analysis queue) shows the queue in SQL. In the app, the technician's queue is the normal sample list scoped to their lab (queries 4 + 22a).

### `backend/models/dnaMatchModel.js` → `database/sql/dna_matches.sql`

| Model function / SQL piece | `.sql` query |
|---|---|
| `matchSelect` (joined SELECT) | **3** (same columns) |
| `scopeCondition` Officer / Technician | 4 / 5 |
| `findAllMatches` person filter | 6 |
| `findAllMatches` filters status / confidence / case / sample | **11a / 11b / 11c / 11d** |
| `findMatchById` | 3 + `WHERE m.match_id = ?` (9 shows the row) |
| `compareProfileCodes` (recursive CTE) | 1 (1b checks the spec example) |
| `findMatchBetween` | 7 |
| `createMatch` | 2 / 2b |
| `updateMatchStatus` | 8 |
| `deleteMatchById` | **12** |

### `database/sql/trigger.sql`

| Trigger | Runs when |
|---|---|
| `trg_dna_match_confirmed_update` | `updateMatchStatus` (query 8) sets `Confirmed`, and MySQL runs it automatically |
| `trg_dna_match_confirmed_insert` | A row is inserted directly as `Confirmed` |

## Code changes

### `database/sql/dna_samples.sql`

```diff
@@ -133,14 +133,17 @@ ORDER BY s.sample_id DESC;
 
 
 -- 5. View single DNA Sample details (upore insert kora sample)
+-- Backend er sampleSelect (dnaSampleModel.js) hubohu ei column gulo ney
 SELECT
     s.*,
     CONCAT(mp.first_name, ' ', mp.last_name) AS person_name,
+    mp.status AS person_status,             -- missing person er current status (Identified kina)
     CONCAT(fm.first_name, ' ', fm.last_name) AS family_member_name,
     fm.relationship AS family_relationship,
     dl.lab_name,
     CONCAT(lt.first_name, ' ', lt.last_name) AS technician_name,
-    cf.case_id
+    cf.case_id,
+    cf.officer_id AS case_officer_id        -- case er investigating officer
 FROM dna_samples s
 INNER JOIN missing_persons mp ON s.person_id = mp.person_id
 LEFT JOIN family_members fm ON s.family_id = fm.family_id
@@ -328,3 +331,98 @@ WHERE sample_id = @analysis_sample_id;
 -- 20. Test sample delete
 DELETE FROM dna_samples
 WHERE sample_id = @analysis_sample_id;
+
+
+-- =========================================================
+-- Backend search, filter & lookup queries (Member 1 - Issue 1)
+-- GET /api/dna-samples?search=&status=&person_id=&family_id=&lab_id=&case_id=
+-- Backend (findAllSamples) shudhu je filter pathano hoy sheta AND diye jog kore —
+-- ekhane proti ta filter alada kore test kora holo.
+-- =========================================================
+
+-- 21. Search: sample id, person name, family member name, lab name, sample type ba profile code diye
+-- Example search text = 'Rafiqul'. Backend e ekhane ? placeholder thake:
+--   sample_id = ? → search text number hole sheta, noile 0 (ekhane 'Rafiqul' number na, tai 0)
+--   LIKE ?        → '%Rafiqul%' (wildcard shoho)
+-- Note: @variable diye LIKE korle collation mismatch hote pare, tai literal value use kora holo
+--       (backend er ? parameter o literal hishebe bind hoy)
+SELECT
+    s.sample_id,
+    CONCAT(mp.first_name, ' ', mp.last_name) AS person_name,
+    CONCAT(fm.first_name, ' ', fm.last_name) AS family_member_name,
+    dl.lab_name,
+    s.sample_type,
+    s.dna_profile_code,
+    s.status
+FROM dna_samples s
+INNER JOIN missing_persons mp ON s.person_id = mp.person_id
+LEFT JOIN family_members fm ON s.family_id = fm.family_id
+LEFT JOIN dna_labs dl ON s.lab_id = dl.lab_id
+LEFT JOIN lab_technicians lt ON s.technician_id = lt.technician_id
+LEFT JOIN case_files cf ON cf.person_id = s.person_id
+WHERE 1 = 1
+  AND (
+    s.sample_id = 0
+    OR CONCAT(mp.first_name, ' ', mp.last_name) LIKE '%Rafiqul%'
+    OR CONCAT(fm.first_name, ' ', fm.last_name) LIKE '%Rafiqul%'
+    OR dl.lab_name LIKE '%Rafiqul%'
+    OR s.sample_type LIKE '%Rafiqul%'
+    OR s.dna_profile_code LIKE '%Rafiqul%'
+  )
+ORDER BY s.sample_id DESC;
+
+
+-- 22a. Filter: status (e.g. shudhu 'Analyzed' sample — New DNA Comparison page eta use kore)
+SELECT s.sample_id, s.status, s.dna_profile_code
+FROM dna_samples s
+WHERE 1 = 1
+  AND s.status = 'Analyzed'
+ORDER BY s.sample_id DESC;
+
+-- 22b. Filter: person_id (Missing Person Details → DNA Samples tab)
+SELECT s.sample_id, s.person_id, s.sample_type
+FROM dna_samples s
+WHERE 1 = 1
+  AND s.person_id = 1
+ORDER BY s.sample_id DESC;
+
+-- 22c. Filter: family_id (ekta family member er reference sample)
+SELECT s.sample_id, s.family_id, s.sample_type
+FROM dna_samples s
+WHERE 1 = 1
+  AND s.family_id = 1
+ORDER BY s.sample_id DESC;
+
+-- 22d. Filter: lab_id (ekta lab er sample)
+SELECT s.sample_id, s.lab_id, s.status
+FROM dna_samples s
+WHERE 1 = 1
+  AND s.lab_id = 2
+ORDER BY s.sample_id DESC;
+
+-- 22e. Filter: case_id (Case Details er DNA Samples — case_files LEFT JOIN diye)
+SELECT s.sample_id, cf.case_id, s.person_id
+FROM dna_samples s
+LEFT JOIN case_files cf ON cf.person_id = s.person_id
+WHERE 1 = 1
+  AND cf.case_id = 1
+ORDER BY s.sample_id DESC;
+
+-- 22f. Combined: backend ekshathe onek filter + role scope AND kore (e.g. Officer 1 er Analyzed sample)
+SELECT s.sample_id, CONCAT(mp.first_name, ' ', mp.last_name) AS person_name, s.status, cf.case_id
+FROM dna_samples s
+INNER JOIN missing_persons mp ON s.person_id = mp.person_id
+LEFT JOIN case_files cf ON cf.person_id = s.person_id
+WHERE 1 = 1
+  AND s.status = 'Analyzed'
+  AND s.person_id = 1
+  AND cf.officer_id = 1           -- Officer scope (query 3 er condition)
+ORDER BY s.sample_id DESC;
+
+
+-- 23. Lookup: missing person ache kina (register/update/family DNA view er age)
+SELECT person_id FROM missing_persons WHERE person_id = 1 LIMIT 1;
+
+
+-- 24. Lookup: DNA lab ache kina (register/update er age)
+SELECT lab_id FROM dna_labs WHERE lab_id = 1 LIMIT 1;
```

### `database/sql/dna_matches.sql`

```diff
@@ -127,27 +127,44 @@ SET @manual_match_id = LAST_INSERT_ID();
 
 -- 3. View all DNA matches with both sample details (Admin view)
 -- dna_samples table ke duibar JOIN (u = unknown, ms = matched) — self-join er moto alias
+-- Backend er matchSelect (dnaMatchModel.js) hubohu ei column gulo ney
 SELECT
     m.match_id,
     m.unknown_sample_id,
+    m.matched_sample_id,
+    m.similarity_percentage,
+    m.confidence_level,
+    m.match_date,
+    m.match_status,
+    m.match_method,
+    -- Unknown (evidence) sample er info
+    u.person_id AS unknown_person_id,
     CONCAT(up.first_name, ' ', up.last_name) AS unknown_person_name,
+    u.family_id AS unknown_family_id,
+    CONCAT(uf.first_name, ' ', uf.last_name) AS unknown_family_name,
+    uf.relationship AS unknown_family_relationship,
+    u.sample_type AS unknown_sample_type,
     u.dna_profile_code AS unknown_profile_code,
-    m.matched_sample_id,
+    ul.lab_name AS unknown_lab_name,
+    -- Matched (reference) sample er info
+    ms.person_id AS matched_person_id,
     CONCAT(mp.first_name, ' ', mp.last_name) AS matched_person_name,
+    mp.status AS matched_person_status,       -- trigger er por 'Identified' dekhabe (Issue 5)
+    ms.family_id AS matched_family_id,
     CONCAT(mf.first_name, ' ', mf.last_name) AS matched_family_name,
     mf.relationship AS matched_family_relationship,
+    ms.sample_type AS matched_sample_type,
     ms.dna_profile_code AS matched_profile_code,
-    m.similarity_percentage,
-    m.confidence_level,
-    m.match_date,
-    m.match_status,
-    m.match_method
+    ml.lab_name AS matched_lab_name
 FROM dna_matches m
 INNER JOIN dna_samples u ON u.sample_id = m.unknown_sample_id
 INNER JOIN missing_persons up ON up.person_id = u.person_id
+LEFT JOIN family_members uf ON uf.family_id = u.family_id
+LEFT JOIN dna_labs ul ON ul.lab_id = u.lab_id
 INNER JOIN dna_samples ms ON ms.sample_id = m.matched_sample_id
 INNER JOIN missing_persons mp ON mp.person_id = ms.person_id
 LEFT JOIN family_members mf ON mf.family_id = ms.family_id
+LEFT JOIN dna_labs ml ON ml.lab_id = ms.lab_id
 ORDER BY m.match_id DESC;
 
 
@@ -209,3 +226,59 @@ WHERE match_id = @new_match_id;
 -- 10. Delete test matches (seed data jeno thik thake)
 DELETE FROM dna_matches
 WHERE match_id IN (@new_match_id, @manual_match_id);
+
+
+-- =========================================================
+-- Backend filter & delete queries (Member 1 - Issue 4)
+-- GET /api/dna-matches?status=&confidence=&person_id=&case_id=&sample_id=
+-- Backend (findAllMatches) shudhu je filter pathano hoy sheta AND diye jog kore —
+-- ekhane proti ta filter alada kore test kora holo.
+-- =========================================================
+
+-- 11a. Filter: match_status (e.g. shudhu 'Pending Review' — review baki ache)
+SELECT m.match_id, m.match_status
+FROM dna_matches m
+WHERE 1 = 1
+  AND m.match_status = 'Pending Review'
+ORDER BY m.match_id DESC;
+
+-- 11b. Filter: confidence_level
+SELECT m.match_id, m.similarity_percentage, m.confidence_level
+FROM dna_matches m
+WHERE 1 = 1
+  AND m.confidence_level = 'High'
+ORDER BY m.match_id DESC;
+
+-- 11c. Filter: case_id (Case Details er DNA Matches — case er missing person er kono sample thakle)
+SELECT m.match_id, m.unknown_sample_id, m.matched_sample_id
+FROM dna_matches m
+INNER JOIN dna_samples u ON u.sample_id = m.unknown_sample_id
+INNER JOIN dna_samples ms ON ms.sample_id = m.matched_sample_id
+WHERE 1 = 1
+  AND EXISTS (
+    SELECT 1
+    FROM case_files cf_filter
+    WHERE cf_filter.case_id = 1
+      AND cf_filter.person_id IN (u.person_id, ms.person_id)
+  )
+ORDER BY m.match_id DESC;
+
+-- 11d. Filter: sample_id (ekta sample je shob match e ache — unknown ba matched hishebe)
+SELECT m.match_id, m.unknown_sample_id, m.matched_sample_id
+FROM dna_matches m
+WHERE 1 = 1
+  AND (m.unknown_sample_id = 2 OR m.matched_sample_id = 2)
+ORDER BY m.match_id DESC;
+
+
+-- 12. Delete single match by id (DELETE /api/dna-matches/:id — shudhu Admin, Confirmed na hole)
+-- Test er jonno ekta temporary match banie sheta delete kora
+INSERT INTO dna_matches (unknown_sample_id, matched_sample_id, similarity_percentage, confidence_level, match_date, match_status, match_method)
+VALUES (6, 1, 27.27, 'Low', CURDATE(), 'Pending Review', 'Computed');
+SET @delete_match_id = LAST_INSERT_ID();
+
+-- Delete er age status check (controller: Confirmed hole 409)
+SELECT match_id, match_status FROM dna_matches WHERE match_id = @delete_match_id;
+
+DELETE FROM dna_matches
+WHERE match_id = @delete_match_id;
```

## Testing

Both files were run on local MySQL 8.0 with **0 errors**:

| Query | Result |
|---|---|
| 21 search `Rafiqul` | Sample 2 (Rafiqul Islam's reference) |
| 22a `status = 'Analyzed'` | Samples 6, 5, 2, 1 |
| 22b `person_id = 1` | Samples 3, 2, 1 |
| 22c `family_id = 1` | Sample 2 |
| 22d `lab_id = 2` | Samples 5, 4 |
| 22e `case_id = 1` | Samples 3, 2, 1 |
| 22f combined (Analyzed + person 1 + Officer 1 scope) | Samples 2, 1 |
| 23 / 24 lookups | person 1 / lab 1 found |
| 11a–d match filters | Correct rows |
| 12 delete one match | Temporary match inserted and deleted |

After both runs the seed data was unchanged: 6 samples, match 1 Pending Review / match 2 Rejected, John and Jane Under Investigation.

---

<!-- Phase 6 onwards will be added below as each phase is completed. -->
