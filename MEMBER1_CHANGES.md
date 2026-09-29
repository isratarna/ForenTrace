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
| 3 | Issue 3: Laboratory DNA Analysis Workflow | ⏳ Pending |
| 4 | Issue 4: DNA Matching Workflow | ⏳ Pending |
| 5 | Issue 5: SQL Trigger (automatic identification update) | ⏳ Pending |
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

<!-- Phase 3 onwards will be added below as each phase is completed. -->
