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
| 6 | Issue 6: SQL UNION Report | ✅ Done |
| 7 | Issue 7: Connect the lab frontend to the real backend | ✅ Done |
| Extra | Stored procedure `compare_dna_samples` | ✅ Done |
| UI 1 | UI upgrade: black + teal DNA theme, live elements, scroll effects (branch `ui/m1-ui-upgrade`) | ✅ Done |
| UI 1b | UI minimal pass: neutral dark, teal only as accent, fewer/quieter effects | ✅ Done |
| UI 2 | DNA Analytics page onto the theme + removed unprotected duplicate `/dna-analytics` route | ✅ Done |
| UI 3 | Chatbot widget onto the dark theme + leftover light-theme pages (DNA Labs, Lab Technicians, Family Members) | ✅ Done |

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

# Phase 6 — Issue 6: SQL UNION Report

## Goal

A combined **DNA sample overview report** that joins two different result sets with SQL `UNION`:

| Part | `report_status` | Which samples |
|---|---|---|
| **1** | `Matched` | Samples that appear in at least one **Confirmed** DNA match, as either the unknown or the matched sample |
| **2** | `Awaiting Match` | Samples that are **Analyzed** and have a DNA profile code, but are **not** in any Confirmed match yet. These are ready to compare or waiting for review |

Example output (same shape as the spec):

| Sample ID | Status |
|---|---|
| 1 | Matched |
| 5 | Awaiting Match |

## How the UNION works

- **Same columns in both SELECTs:** `sample_id, person_name, source, sample_type, lab_name, dna_profile_code, report_status, confirmed_match_id, pending_review_matches`. UNION requires the same number and order of columns.
- **`report_status` is a fixed text value** in each part (`'Matched' AS report_status` / `'Awaiting Match' AS report_status`). It labels which part each row came from.
- **Part 1** uses `WHERE EXISTS (confirmed match)`. **Part 2** uses `WHERE status = 'Analyzed' AND dna_profile_code IS NOT NULL AND NOT EXISTS (confirmed match)`. So the two parts never overlap. `UNION` (not `UNION ALL`) is used as the spec asks, and it would remove duplicates anyway.
- **One `ORDER BY` for the whole UNION:** `report_status DESC, sample_id ASC`, so Matched rows come first.
- **Extra columns:** `confirmed_match_id` (the smallest Confirmed match id for that sample, or NULL in Part 2) and `pending_review_matches` (how many matches are still waiting for review).
- **Not included:** samples that aren't analyzed yet (Awaiting Analysis / In Analysis / Rejected) can't be matched, so they are in neither part.

## Role scope

The report uses the **same access rules as the DNA sample list** (Phase 1). The scope condition is added to **both** UNION parts, so the parameters are passed twice:

| Role | Rows |
|---|---|
| Admin | All samples |
| Officer | Samples of missing persons in their assigned cases (`cf.officer_id = ?`) |
| Lab Technician | Samples in their lab (`s.lab_id IN (technician's lab)`) |

## Files changed

| File | Type | What changed |
|---|---|---|
| `database/sql/union_report.sql` | New | Admin UNION report, officer and technician versions, a `GROUP BY` summary over the UNION, and a demo that confirms a match temporarily and then restores it |
| `backend/models/dnaSampleModel.js` | Modified | Added `findSampleOverviewReport(user)`, which reuses `scopeCondition` for both parts |
| `backend/controllers/dnaSampleController.js` | Modified | Added `getSampleOverviewReport`: shapes the rows and adds a summary |
| `backend/routes/dnaSampleRoutes.js` | Modified | Added `GET /api/dna-samples/report/overview` (all 3 roles, before `/:id`) |
| `frontend/src/services/dnaService.js` | Modified | Added `getSampleOverviewReport()` |
| `frontend/src/pages/DnaSampleReport.jsx` | New | Report page |
| `frontend/src/routes/AppRoutes.jsx` | Modified | Added the `/reports/dna-samples` route |
| `frontend/src/layouts/AppLayout.jsx` | Modified | "DNA Sample Report" sidebar link for Admin, Officer and Lab Technician |

## API endpoint

| Method | Endpoint | Roles | Response |
|---|---|---|---|
| GET | `/api/dna-samples/report/overview` | Admin, Officer, Lab Technician | `{ summary: { matched, awaitingMatch, total }, report: [{ sampleId, personName, source, sampleType, labName, dnaProfileCode, reportStatus, confirmedMatchId, pendingReviewMatches }] }` |

---

## 6.1 `database/sql/union_report.sql` (new)

| Query | What it does |
|---|---|
| 1 | **The main UNION report** (Admin): Part 1 `Matched` UNION Part 2 `Awaiting Match`, with all columns and one `ORDER BY` |
| 2 | Officer version: the same two parts, each with `AND cf.officer_id = 1` |
| 3 | Technician version: the same two parts, each with the technician's lab subquery |
| 4 | **Summary**: the UNION used as a derived table (`FROM (... UNION ...) AS sample_overview`) with `GROUP BY report_status` + `COUNT(*)` |
| 5 (demo) | The seed data has no Confirmed match yet (match 1 is Pending Review, kept for the Phase 5 demo), so Part 1 is empty. The demo saves the current values, **confirms match 1**, re-runs the report (samples 1 and 2 move to `Matched`), then restores everything. Confirming also runs the Phase 5 trigger, and the restore resets that too |

```sql
-- =========================================================
-- ForenTrace: SQL UNION Report — DNA Sample Overview (Member 1 - Issue 6)
-- File: database/sql/union_report.sql
--
-- Duita alada result set UNION diye ek report e jora hoy:
--   Part 1 — 'Matched'        : je sample kono 'Confirmed' DNA match e ache (unknown ba matched hishebe)
--   Part 2 — 'Awaiting Match' : Analyzed + DNA profile code ache, kintu ekhono kono Confirmed match nai
--                               (matching er jonno ready / review er opekkhay)
--
-- Output example:
--   | sample_id | report_status  |
--   | 1         | Matched        |
--   | 5         | Awaiting Match |
--
-- UNION er rule: duita SELECT er column shongkhya ar order same hote hobe.
-- Duita part eke oporer theke alada (EXISTS vs NOT EXISTS), tai kono duplicate thake na —
-- tobuo spec onujayi UNION (duplicate remove kore) use kora hoyeche.
-- =========================================================

USE forentrace_db;

-- 1. DNA Sample Overview Report (Admin — shob sample)
-- Part 1: Matched samples
SELECT
    s.sample_id,
    CONCAT(mp.first_name, ' ', mp.last_name) AS person_name,
    CASE WHEN s.family_id IS NULL THEN 'Missing Person / Evidence' ELSE 'Family Reference' END AS source,
    s.sample_type,
    dl.lab_name,
    s.dna_profile_code,
    'Matched' AS report_status,
    -- Kon confirmed match e ache (ekadhik thakle prothom ta)
    (SELECT MIN(m.match_id)
     FROM dna_matches m
     WHERE m.match_status = 'Confirmed'
       AND (m.unknown_sample_id = s.sample_id OR m.matched_sample_id = s.sample_id)) AS confirmed_match_id,
    -- Review er opekkhay koto gula match ache
    (SELECT COUNT(*)
     FROM dna_matches m
     WHERE m.match_status = 'Pending Review'
       AND (m.unknown_sample_id = s.sample_id OR m.matched_sample_id = s.sample_id)) AS pending_review_matches
FROM dna_samples s
INNER JOIN missing_persons mp ON mp.person_id = s.person_id
LEFT JOIN dna_labs dl ON dl.lab_id = s.lab_id
LEFT JOIN case_files cf ON cf.person_id = s.person_id
WHERE EXISTS (
    -- Ei sample kono Confirmed match e ache
    SELECT 1
    FROM dna_matches m
    WHERE m.match_status = 'Confirmed'
      AND (m.unknown_sample_id = s.sample_id OR m.matched_sample_id = s.sample_id)
)

UNION

-- Part 2: Awaiting Match samples
SELECT
    s.sample_id,
    CONCAT(mp.first_name, ' ', mp.last_name) AS person_name,
    CASE WHEN s.family_id IS NULL THEN 'Missing Person / Evidence' ELSE 'Family Reference' END AS source,
    s.sample_type,
    dl.lab_name,
    s.dna_profile_code,
    'Awaiting Match' AS report_status,
    NULL AS confirmed_match_id,                -- confirmed match nai
    (SELECT COUNT(*)
     FROM dna_matches m
     WHERE m.match_status = 'Pending Review'
       AND (m.unknown_sample_id = s.sample_id OR m.matched_sample_id = s.sample_id)) AS pending_review_matches
FROM dna_samples s
INNER JOIN missing_persons mp ON mp.person_id = s.person_id
LEFT JOIN dna_labs dl ON dl.lab_id = s.lab_id
LEFT JOIN case_files cf ON cf.person_id = s.person_id
WHERE s.status = 'Analyzed'                   -- analysis shesh, profile code ache
  AND s.dna_profile_code IS NOT NULL
  AND NOT EXISTS (
    -- Kono Confirmed match e nai
    SELECT 1
    FROM dna_matches m
    WHERE m.match_status = 'Confirmed'
      AND (m.unknown_sample_id = s.sample_id OR m.matched_sample_id = s.sample_id)
)

-- UNION er por puro result er ORDER BY: Matched age, tarpor Awaiting Match, proti group e sample_id
ORDER BY report_status DESC, sample_id ASC;


-- 2. Officer version: duita part-e ekoi scope condition (officer_id = 1 er assigned case)
-- Backend e role onujayi ei condition duita SELECT er WHERE e-i jog hoy
SELECT s.sample_id, 'Matched' AS report_status
FROM dna_samples s
LEFT JOIN case_files cf ON cf.person_id = s.person_id
WHERE EXISTS (SELECT 1 FROM dna_matches m WHERE m.match_status = 'Confirmed' AND (m.unknown_sample_id = s.sample_id OR m.matched_sample_id = s.sample_id))
  AND cf.officer_id = 1
UNION
SELECT s.sample_id, 'Awaiting Match' AS report_status
FROM dna_samples s
LEFT JOIN case_files cf ON cf.person_id = s.person_id
WHERE s.status = 'Analyzed' AND s.dna_profile_code IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM dna_matches m WHERE m.match_status = 'Confirmed' AND (m.unknown_sample_id = s.sample_id OR m.matched_sample_id = s.sample_id))
  AND cf.officer_id = 1
ORDER BY report_status DESC, sample_id ASC;


-- 3. Lab Technician version: duita part-e technician er lab (user_id = 2 ba technician_id = 1)
SELECT s.sample_id, 'Matched' AS report_status
FROM dna_samples s
WHERE EXISTS (SELECT 1 FROM dna_matches m WHERE m.match_status = 'Confirmed' AND (m.unknown_sample_id = s.sample_id OR m.matched_sample_id = s.sample_id))
  AND s.lab_id IN (SELECT lt.lab_id FROM lab_technicians lt WHERE lt.user_id = 2 OR lt.technician_id = 1)
UNION
SELECT s.sample_id, 'Awaiting Match' AS report_status
FROM dna_samples s
WHERE s.status = 'Analyzed' AND s.dna_profile_code IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM dna_matches m WHERE m.match_status = 'Confirmed' AND (m.unknown_sample_id = s.sample_id OR m.matched_sample_id = s.sample_id))
  AND s.lab_id IN (SELECT lt.lab_id FROM lab_technicians lt WHERE lt.user_id = 2 OR lt.technician_id = 1)
ORDER BY report_status DESC, sample_id ASC;


-- 4. Summary: UNION result ke derived table banie GROUP BY diye count
SELECT report_status, COUNT(*) AS total_samples
FROM (
    SELECT s.sample_id, 'Matched' AS report_status
    FROM dna_samples s
    WHERE EXISTS (SELECT 1 FROM dna_matches m WHERE m.match_status = 'Confirmed' AND (m.unknown_sample_id = s.sample_id OR m.matched_sample_id = s.sample_id))
    UNION
    SELECT s.sample_id, 'Awaiting Match' AS report_status
    FROM dna_samples s
    WHERE s.status = 'Analyzed' AND s.dna_profile_code IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM dna_matches m WHERE m.match_status = 'Confirmed' AND (m.unknown_sample_id = s.sample_id OR m.matched_sample_id = s.sample_id))
) AS sample_overview
GROUP BY report_status
ORDER BY report_status DESC;


-- =========================================================
-- DEMO: seed e ekhono kono Confirmed match nai (match 1 'Pending Review'),
-- tai Part 1 faka ashe. Match 1 temporary Confirm kore report abar dekhi, tarpor restore.
-- (Confirm korle Issue 5 er trigger John Doe ke 'Identified' kore — restore e sheta o ferot)
-- =========================================================
SET @old_match_status = (SELECT match_status FROM dna_matches WHERE match_id = 1);
SET @old_person_status = (SELECT status FROM missing_persons WHERE person_id = 1);

UPDATE dna_matches SET match_status = 'Confirmed' WHERE match_id = 1;

-- 5. Confirm er por: sample 1 ar 2 'Matched' e chole ashe, baki analyzed sample 'Awaiting Match'
SELECT s.sample_id, 'Matched' AS report_status
FROM dna_samples s
WHERE EXISTS (SELECT 1 FROM dna_matches m WHERE m.match_status = 'Confirmed' AND (m.unknown_sample_id = s.sample_id OR m.matched_sample_id = s.sample_id))
UNION
SELECT s.sample_id, 'Awaiting Match' AS report_status
FROM dna_samples s
WHERE s.status = 'Analyzed' AND s.dna_profile_code IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM dna_matches m WHERE m.match_status = 'Confirmed' AND (m.unknown_sample_id = s.sample_id OR m.matched_sample_id = s.sample_id))
ORDER BY report_status DESC, sample_id ASC;

-- Restore (seed data ager moto)
UPDATE dna_matches SET match_status = @old_match_status WHERE match_id = 1;
UPDATE missing_persons SET status = @old_person_status WHERE person_id = 1;
```

## 6.2 `backend/models/dnaSampleModel.js` (modified: Phase 6 part)

| Part | What it does |
|---|---|
| `overviewColumns` | The shared column list. Both SELECTs must have the same columns |
| `confirmedMatchCondition` | The "sample is in a Confirmed match" subquery, used with `EXISTS` in Part 1 and `NOT EXISTS` in Part 2 |
| `pendingReviewCount` | Subquery counting the sample's Pending Review matches |
| `overviewJoins` | `dna_samples` + `missing_persons` + `dna_labs` + `case_files` (`cf` is needed for the officer scope) |
| `findSampleOverviewReport(user)` | Builds `SELECT ... 'Matched' ... UNION SELECT ... 'Awaiting Match' ... ORDER BY`. It adds `scope.sql` to **both** WHERE clauses and passes `[...scope.params, ...scope.params]` |

This is the same SQL as `union_report.sql` query 1. The shared pieces are written once as JavaScript strings, and the role scope is added the same way as queries 2 and 3.

```js
// ---------- SQL UNION Report — DNA Sample Overview (Member 1 - Issue 6) ----------
// Query ta database/sql/union_report.sql er 1 number (role scope duita part-ei 2/3 number er moto jog hoy)

// Duita part er common column (UNION er jonno duita SELECT e column same hote hobe)
const overviewColumns = `
    s.sample_id,
    CONCAT(mp.first_name, ' ', mp.last_name) AS person_name,
    CASE WHEN s.family_id IS NULL THEN 'Missing Person / Evidence' ELSE 'Family Reference' END AS source,
    s.sample_type,
    dl.lab_name,
    s.dna_profile_code`

// Sample ta kono 'Confirmed' match e ache kina (unknown ba matched hishebe)
const confirmedMatchCondition = `
    SELECT 1 FROM dna_matches m
    WHERE m.match_status = 'Confirmed'
      AND (m.unknown_sample_id = s.sample_id OR m.matched_sample_id = s.sample_id)`

// Ei sample er koto gula match 'Pending Review' e ache
const pendingReviewCount = `
    (SELECT COUNT(*) FROM dna_matches m
     WHERE m.match_status = 'Pending Review'
       AND (m.unknown_sample_id = s.sample_id OR m.matched_sample_id = s.sample_id)) AS pending_review_matches`

const overviewJoins = `
  FROM dna_samples s
  INNER JOIN missing_persons mp ON mp.person_id = s.person_id
  LEFT JOIN dna_labs dl ON dl.lab_id = s.lab_id
  LEFT JOIN case_files cf ON cf.person_id = s.person_id`

// UNION report: Part 1 'Matched' + Part 2 'Awaiting Match'
// Role scope (scopeCondition) DUITA part er WHERE e-i jog hoy, tai params o duibar
export async function findSampleOverviewReport(user = null) {
  const scope = scopeCondition(user)

  const [rows] = await pool.execute(
    `
    SELECT
      ${overviewColumns},
      'Matched' AS report_status,
      (SELECT MIN(m.match_id) FROM dna_matches m
       WHERE m.match_status = 'Confirmed'
         AND (m.unknown_sample_id = s.sample_id OR m.matched_sample_id = s.sample_id)) AS confirmed_match_id,
      ${pendingReviewCount}
    ${overviewJoins}
    WHERE EXISTS (${confirmedMatchCondition})${scope.sql}

    UNION

    SELECT
      ${overviewColumns},
      'Awaiting Match' AS report_status,
      NULL AS confirmed_match_id,
      ${pendingReviewCount}
    ${overviewJoins}
    WHERE s.status = 'Analyzed'
      AND s.dna_profile_code IS NOT NULL
      AND NOT EXISTS (${confirmedMatchCondition})${scope.sql}

    ORDER BY report_status DESC, sample_id ASC
    `,
    [...scope.params, ...scope.params]
  )

  return rows
}
```

## 6.3 `backend/controllers/dnaSampleController.js` (modified: Phase 6 part)

`getSampleOverviewReport` converts each row to camelCase, turns `pending_review_matches` (a `COUNT()` string) into a number, and counts the `Matched` / `Awaiting Match` rows for the summary.

```js
// ---------- SQL UNION Report — DNA Sample Overview (Member 1 - Issue 6) ----------

// GET /api/dna-samples/report/overview — Matched + Awaiting Match sample (UNION), role onujayi scoped
export async function getSampleOverviewReport(req, res) {
  try {
    const rows = await findSampleOverviewReport(req.session.user)

    const report = rows.map(row => ({
      sampleId: row.sample_id,
      personName: row.person_name,
      source: row.source,
      sampleType: row.sample_type,
      labName: row.lab_name || null,
      dnaProfileCode: row.dna_profile_code,
      reportStatus: row.report_status, // 'Matched' ba 'Awaiting Match'
      confirmedMatchId: row.confirmed_match_id ?? null,
      pendingReviewMatches: Number(row.pending_review_matches), // COUNT() string/bigint ashe
    }))

    // Report card er jonno duita group er count
    const matched = report.filter(item => item.reportStatus === 'Matched').length

    return res.status(200).json({
      success: true,
      summary: {
        matched,
        awaitingMatch: report.length - matched,
        total: report.length,
      },
      report,
    })
  } catch (error) {
    console.error('DNA sample overview report error:', error)
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}
```

## 6.4 `backend/routes/dnaSampleRoutes.js` (modified)

```diff
@@ -9,6 +9,7 @@ import {
   getFamilyDna,
   updateAnalysis,
   getLabSummary,
+  getSampleOverviewReport,
 } from '../controllers/dnaSampleController.js'
 import { requireAuth } from '../middleware/authMiddleware.js'
 import { requireRole } from '../middleware/roleMiddleware.js'
@@ -23,6 +24,9 @@ router.get('/family/:personId', requireAuth, requireRole('Admin', 'Officer'), ge
 // Technician er nijer lab er workload summary (Issue 3) — eta o '/:id' er AGE
 router.get('/lab/summary', requireAuth, requireRole('Lab Technician'), getLabSummary)
 
+// UNION report: Matched + Awaiting Match sample (Issue 6) — tinjonei, role onujayi scoped — '/:id' er AGE
+router.get('/report/overview', requireAuth, requireRole('Admin', 'Officer', 'Lab Technician'), getSampleOverviewReport)
+
 // Admin, Officer, Lab Technician — tinjonei sample dekhte parbe (controller role onujayi data filter kore)
 router.get('/',requireAuth, requireRole('Admin', 'Officer', 'Lab Technician'), listSamples)
 router.get('/:id', requireAuth, requireRole('Admin', 'Officer', 'Lab Technician'), getSample)
```

---

## 6.5 `frontend/src/services/dnaService.js` (modified)

```diff
@@ -56,6 +56,16 @@ export async function getLabSummary() {
   return response.data.summary
 }
 
+// UNION report: Matched + Awaiting Match sample (Issue 6)
+// Response: { summary: { matched, awaitingMatch, total }, report: [...] }
+export async function getSampleOverviewReport() {
+  const response = await api.get('/dna-samples/report/overview')
+  return {
+    summary: response.data.summary,
+    report: response.data.report ?? [],
+  }
+}
+
 // Missing person er family member + tader reference DNA sample (Issue 2)
 // Response: { summary: {...}, familyMembers: [{ familyId, name, relationship, phone, samples: [...] }] }
 export async function getFamilyDnaByPerson(personId) {
@@ -139,6 +149,7 @@ export default {
   getFamilyDnaByPerson,
   updateSampleAnalysis,
   getLabSummary,
+  getSampleOverviewReport,
   getLabs,
   getTechnicians,
   getMatches,
```

## 6.6 `frontend/src/pages/DnaSampleReport.jsx` (new)

| Part | What it does |
|---|---|
| Summary cards | **Matched** / **Awaiting Match** / **Total in Report** (rows returned by the UNION) |
| Status filter | All / Matched / Awaiting Match (client side) |
| Table | Sample ID (links to the sample) · status badge · missing person · source · type · lab · profile code · **Match Details**: a link to the confirmed match for Matched rows, otherwise "N pending review" or "Not compared yet" |
| Role note | The backend already scopes the data. A technician with no analyzed samples sees a lab-specific empty message |

```jsx
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { MetricCard, PageHeader, StatusBadge } from '../components/Ui'
import { useAuth } from '../context/AuthContext'
import { getSampleOverviewReport } from '../services/dnaService'

const REPORT_STATUSES = ['Matched', 'Awaiting Match']

// DNA Sample Overview Report (Member 1 - Issue 6)
// Backend e SQL UNION: Part 1 'Matched' (Confirmed match e ache) + Part 2 'Awaiting Match' (analyzed, confirmed match nai)
export default function DnaSampleReport() {
  const { role } = useAuth()
  const [data, setData] = useState({ summary: null, report: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    let active = true
    getSampleOverviewReport()
      .then(result => { if (active) setData(result) })
      .catch(requestError => { if (active) setError(requestError.response?.data?.message || 'Failed to load the DNA sample report.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  // Report status diye client side filter
  const rows = useMemo(
    () => data.report.filter(item => !statusFilter || item.reportStatus === statusFilter),
    [data.report, statusFilter]
  )

  const isTechnician = role === 'Lab Technician' // technician investigation (person) page e link pabe na

  return (
    <>
      <PageHeader
        title="DNA Sample Overview Report"
        subtitle="Combined report (SQL UNION) of samples with confirmed matches and analyzed samples still waiting for a match."
      />

      {loading && <div className="card"><div className="card-body text-center text-secondary py-4">Loading report...</div></div>}
      {error && <div className="alert alert-danger">{error}</div>}

      {!loading && !error && data.summary && (
        <>
          {/* UNION er duita part er count */}
          <div className="row g-3 mb-4">
            <div className="col-sm-4"><MetricCard label="Matched" value={data.summary.matched} hint="Samples in a confirmed DNA match" tone="success"/></div>
            <div className="col-sm-4"><MetricCard label="Awaiting Match" value={data.summary.awaitingMatch} hint="Analyzed, no confirmed match yet" tone="warning"/></div>
            <div className="col-sm-4"><MetricCard label="Total in Report" value={data.summary.total} hint="Rows returned by the UNION"/></div>
          </div>

          <div className="card mb-3">
            <div className="card-body d-flex flex-wrap align-items-end gap-3">
              <div>
                <label className="form-label" htmlFor="report-status">Report status</label>
                <select id="report-status" className="form-select" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
                  <option value="">All statuses</option>
                  {REPORT_STATUSES.map(status => <option key={status}>{status}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead><tr><th>Sample ID</th><th>Status</th><th>Missing Person</th><th>Source</th><th>Sample Type</th><th>Lab</th><th>DNA Profile</th><th>Match Details</th></tr></thead>
                <tbody>
                  {rows.map(item => (
                    <tr key={item.sampleId}>
                      <td className="fw-semibold"><Link to={`/dna-samples/${item.sampleId}`}>#{item.sampleId}</Link></td>
                      <td><StatusBadge value={item.reportStatus}/></td>
                      <td>{item.personName}</td>
                      <td>{item.source}</td>
                      <td>{item.sampleType}</td>
                      <td>{item.labName || '—'}</td>
                      <td className="font-monospace">{item.dnaProfileCode}</td>
                      <td>
                        {/* Matched hole confirmed match er link, noile koto gula review er opekkhay */}
                        {item.confirmedMatchId
                          ? <Link to={`/dna-matches/${item.confirmedMatchId}`}>Confirmed match #{item.confirmedMatchId}</Link>
                          : item.pendingReviewMatches
                            ? <span className="text-secondary">{item.pendingReviewMatches} pending review</span>
                            : <span className="text-secondary">Not compared yet</span>}
                      </td>
                    </tr>
                  ))}
                  {!rows.length && <tr><td colSpan="8" className="text-center text-secondary py-4">{isTechnician ? 'No analyzed samples in your laboratory yet.' : 'No samples match this report filter.'}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  )
}
```

## 6.7 `frontend/src/routes/AppRoutes.jsx` and `frontend/src/layouts/AppLayout.jsx` (modified)

```diff
@@ -18,6 +18,7 @@ import {
 } from '../pages/MissingPersons'
 import { CaseDetails, CaseForm, Cases } from '../pages/Cases'
 import IntersectionReport from '../pages/IntersectionReport'
+import DnaSampleReport from '../pages/DnaSampleReport' // UNION report (Member 1 - Issue 6)
 
 import {
   DNAAnalysis,
@@ -314,6 +315,16 @@ export default function AppRoutes() {
           }
         />
 
+        {/* DNA Sample Overview — SQL UNION report (Issue 6) — backend role onujayi scoped */}
+        <Route
+          path="reports/dna-samples"
+          element={
+            <ProtectedRoute allowedRoles={['Admin', 'Officer', 'Lab Technician']}>
+              <DnaSampleReport />
+            </ProtectedRoute>
+          }
+        />
+
         <Route
           path="reports/labs-intersection"
           element={
```

```diff
@@ -16,7 +16,8 @@ const navByRole = {
     ['DNA Analytics', '/dna-analytics'],
     ['Users & Accounts', '/admin/users'],
     ['Reports', '/reports'],
-    ['Labs Intersection', '/reports/labs-intersection']
+    ['Labs Intersection', '/reports/labs-intersection'],
+    ['DNA Sample Report', '/reports/dna-samples'] // UNION report (Member 1 - Issue 6)
   ],
   Officer: [
     ['Dashboard', '/officer/dashboard'],
@@ -26,14 +27,16 @@ const navByRole = {
     ['DNA Samples', '/dna-samples'],
     ['DNA Matches', '/dna-matches'],
     ['Reports', '/reports'],
-    ['Labs Intersection', '/reports/labs-intersection']
+    ['Labs Intersection', '/reports/labs-intersection'],
+    ['DNA Sample Report', '/reports/dna-samples'] // UNION report (Member 1 - Issue 6)
   ],
   'Lab Technician': [
     ['Dashboard', '/lab/dashboard'],
     ['DNA Samples', '/dna-samples'],
     ['DNA Matches', '/dna-matches'],
     ['Reports', '/reports'],
-    ['Labs Intersection', '/reports/labs-intersection']
+    ['Labs Intersection', '/reports/labs-intersection'],
+    ['DNA Sample Report', '/reports/dna-samples'] // UNION report (Member 1 - Issue 6)
   ],
 }
 
```

---

## Phase 6 testing

**SQL (`union_report.sql` on local MySQL 8.0, 0 errors):**

| Query | Result |
|---|---|
| 1 Admin report (seed data, no Confirmed match) | Samples 1, 2, 5, 6 → **Awaiting Match**. Samples 1 and 2 show `pending_review_matches = 1` (match 1) |
| 2 Officer 1 | 1, 2 |
| 3 Technician (lab 1) | 1, 2 |
| 4 Summary over the UNION | Awaiting Match = 4 |
| 5 Demo after confirming match 1 | **1, 2 → Matched**. 5, 6 → Awaiting Match |
| After the file runs | Match 1 back to Pending Review, John Doe back to Under Investigation |

**API (`GET /api/dna-samples/report/overview`, backend on a test port):**

| User | Before confirm | After Officer confirms match 1 |
|---|---|---|
| No login | 401 | — |
| Admin | {matched 0, awaiting 4}: #1, #2, #5, #6 | {matched **2**, awaiting 2}: **#1, #2 Matched (m1)**, #5, #6 Awaiting |
| Officer 1 (John Doe's case) | {0, 2}: #1, #2 | {**2**, 0}: #1, #2 Matched |
| Officer 2 (Jane Smith's case) | {0, 1}: #5 | {0, 1}: #5 |
| Technician 1 (lab 1) | {0, 2}: #1, #2 | {**2**, 0}: #1, #2 Matched |
| Technician 4 (lab 3) | {0, 1}: #6 | {0, 1}: #6 |

`GET /api/dna-samples/2` still worked, so the new `/report/overview` route placed before `/:id` doesn't break it. The seed data was restored and the test users removed afterwards.

**Frontend:** `oxlint` found no issues and `vite build` succeeded. The pages were not clicked through in a browser.

## Demo steps

1. Log in (any role) → sidebar **DNA Sample Report**: every analyzed sample shows as **Awaiting Match**.
2. As Admin or Officer 1: **DNA Matches → Match #1 → Confirm Match**.
3. Open **DNA Sample Report** again: samples #1 and #2 are now **Matched** and link to match #1. Because of Phase 5's trigger, John Doe is also **Identified**.

## Known gaps after Phase 6

- The Officer and Lab Technician dashboards (`Dashboards.jsx`) still show mock DNA counts from `DataContext` (Phase 7).

---

# Phase 7 — Issue 7: Connect Laboratory Frontend With Real Backend

## Goal

Replace the mock/`DataContext` data in the laboratory frontend with real API services.

## Status of the pages listed in the issue

Most of this issue was done as each feature was built. Every page was moved to the real API in the same phase that built its backend:

| Page / file (listed in Issue 7) | Now uses | Connected in |
|---|---|---|
| `Laboratory.jsx` (whole file) | `dnaService` only. **No `useData` / `DataContext` import left** | Phases 1–4 |
| `Samples` | `GET /api/dna-samples` (+ `/lab/summary` for technicians) | Phase 1 (+3) |
| `SampleForm` | `POST` / `PUT /api/dna-samples`, labs/technicians/persons/family lookups | Phase 1 (+2) |
| `SampleDetails` | `GET` / `DELETE /api/dna-samples/:id` | Phase 1 |
| `DNAAnalysis` | `PUT /api/dna-samples/:id/analysis` | Phase 3 |
| `Matches` | `GET /api/dna-matches` | Phase 4 |
| `MatchDetails` | `GET /api/dna-matches/:id`, `PUT /:id/status`, `DELETE /:id` | Phase 4 (+5) |
| (new) `MatchForm` | `POST /api/dna-matches/compare`, `POST /api/dna-matches` | Phase 4 |
| `SamplesTable` / `MatchesList` (Missing Person Details tabs) | `getSamplesByPerson` / `getMatchesByPerson` (real) | Phases 1 / 4 |

## What was still mock before Phase 7

A search for `data.samples`, `data.matches`, `addSample`, `updateMatch` and `useData` found three remaining places where lab/DNA data came from mock `DataContext`:

| File | Mock DNA usage | Fixed in Phase 7 |
|---|---|---|
| `pages/Dashboards.jsx` | **Officer** and **Lab Technician** dashboards computed all cards and tables from `data.samples`, `data.matches`, `data.cases` and `data.technicians` | ✅ Now loads everything from the API |
| `pages/Administration.jsx` → `Reports` | The CSV export's "Highest DNA similarity match" and "Samples analyzed" came from `data.matches` / `data.samples` | ✅ Now fetched from the API when exporting |
| `data/DataContext.jsx` + `data/mockData.js` | Mock `samples` / `matches` collections and `addSample` / `updateSample` / `updateMatch` | ✅ Removed (nothing uses them any more) |

## Files changed

| File | What changed |
|---|---|
| `frontend/src/pages/Dashboards.jsx` | Officer and Lab Technician dashboards use `getSamples`, `getMatches`, `getLabSummary` and `caseService.getCases`. The `useData` import was removed. The **Admin dashboard is unchanged** (Member 2's Issue 4) |
| `frontend/src/pages/Administration.jsx` | `Reports.exportReport` is now `async` and fetches DNA samples/matches from the API for its two DNA metrics |
| `frontend/src/data/DataContext.jsx` | Removed the `samples` / `matches` collections, the sample/match linking in `normalizeRecords`, `addSample` / `updateSample` / `updateMatch`, and the checks that looked at samples |
| `frontend/src/data/mockData.js` | Removed the `samples` and `matches` arrays |

No backend changes. The dashboards reuse endpoints built in Phases 1–4.

## Design decisions

- **The officer case filter is in the frontend.** The Officer dashboard shows the officer's own cases. `GET /api/cases` on `main` currently returns **all** cases to officers (in the test, the officer received 2 cases, including another officer's). So the dashboard keeps only rows where `caseItem.officerId === user.officerId`. The DNA data (samples/matches) is already officer-scoped by the backend (Phases 1 and 4). The backend fix for case scoping is Member 2's Issue 5. Once it lands, the frontend filter is harmless and can stay.
- **Dashboard cards and what they count:**

| Dashboard | Card | Source |
|---|---|---|
| Lab Technician | Awaiting Analysis / Analyzed Samples | `GET /dna-samples/lab/summary` (Phase 3) |
| Lab Technician | DNA Matches / High-confidence Matches | `GET /dna-matches` (lab-scoped) |
| Lab Technician | "Samples requiring attention" table | `GET /dna-samples` filtered to Awaiting / In Analysis (the "Priority" column is now "Sample Type") |
| Lab Technician | "DNA result summary" | Reviewed = Confirmed + Rejected matches, plus the high-confidence count |
| Officer | My Active / Pending Cases | `GET /cases` filtered by `officerId` |
| Officer | Samples Awaiting Results | `GET /dna-samples` (officer-scoped) with status Awaiting / In Analysis |
| Officer | New DNA Matches | `GET /dna-matches` (officer-scoped) with `Pending Review` |
| Officer | "Recent investigation activity" | The officer's first 6 cases, linking to `/cases/:id` |

- **Loading and error states:** the cards show `…` while loading, and an alert appears if an API call fails.
- **The CSV export won't break:** if a DNA API call fails, `exportReport` uses an empty list for that metric instead of failing the whole export.
- **Old browser data:** `normalizeRecords` removes `samples` / `matches` from `localStorage` records saved by the old mock version, so stale mock DNA data can't come back.
- **Other members' mock data is untouched:** the stations, officers, labs and technicians mock data in `DataContext` / `Administration.jsx` / `Auth.jsx` is part of Member 3's Issue 7 (removing duplicate/mock admin pages). The missing-person and case mock data used by `Reports` belongs to Member 2's areas. Only the DNA/lab mock data was removed here.

---

## 7.1 `frontend/src/pages/Dashboards.jsx` (modified)

```diff
@@ -1,13 +1,15 @@
 import { Link } from 'react-router-dom'
 import { MetricCard, PageHeader, StatusBadge } from '../components/Ui'
-import { useData } from '../data/DataContext'
 import { useAuth } from '../context/AuthContext'
 import { useState, useEffect } from 'react'
 import caseService from '../services/caseService'
 import adminStatsService from '../services/adminStatsService'
+import { getLabSummary, getMatches, getSamples } from '../services/dnaService' // real DNA data (Member 1 - Issue 7)
+
+// Ei status e thakle sample er analysis ekhono baki
+const isPendingAnalysis = sample => sample.status === 'Awaiting Analysis' || sample.status === 'In Analysis'
 
 export function Dashboard({ type }) {
-  const { data } = useData()
   const { user } = useAuth()
   // Admin: fetch aggregated counts and case summary
   const [adminLoading, setAdminLoading] = useState(false)
@@ -15,6 +17,11 @@ export function Dashboard({ type }) {
   const [adminCounts, setAdminCounts] = useState(null)
   const [caseSummary, setCaseSummary] = useState(null)
 
+  // Officer / Lab Technician: real API data (age mock DataContext theke ashto — Member 1 Issue 7)
+  const [roleData, setRoleData] = useState({ cases: [], samples: [], matches: [], labSummary: null })
+  const [roleLoading, setRoleLoading] = useState(false)
+  const [roleError, setRoleError] = useState(null)
+
   const fetchAdminData = async () => {
     setAdminLoading(true)
     setAdminError(null)
@@ -23,7 +30,7 @@ export function Dashboard({ type }) {
         caseService.getCaseStatistics(),
         adminStatsService.getAdminCounts(),
       ])
-      
+
       setCaseSummary(caseStats.summary || null)
       setAdminCounts(counts || null)
     } catch (err) {
@@ -41,15 +48,55 @@ export function Dashboard({ type }) {
     fetchAdminData()
     return () => { mounted = false }
   }, [type])
-  const assignedLab = user?.lab || data.technicians.find(technician => technician.email === user?.email || technician.name === user?.name)?.lab || ''
-  const scopedCases = type === 'Officer' ? data.cases.filter(caseItem => caseItem.officer === user?.name) : data.cases
-  const scopedSamples = type === 'Lab Technician' ? data.samples.filter(sample => sample.lab === assignedLab) : type === 'Officer' ? data.samples.filter(sample => scopedCases.some(caseItem => caseItem.id === sample.caseId)) : data.samples
-  const scopedMatches = type === 'Lab Technician' ? data.matches.filter(match => match.lab === assignedLab) : type === 'Officer' ? data.matches.filter(match => scopedSamples.some(sample => sample.id === match.unknown || sample.id === match.matched)) : data.matches
-  const activeCases = scopedCases.filter(caseItem => caseItem.status === 'Active')
-  const awaiting = scopedSamples.filter(sample => sample.status === 'Awaiting Analysis')
-  const reviewed = scopedMatches.filter(match => match.status === 'Reviewed')
-  const high = scopedMatches.filter(match => match.confidence === 'High')
-    const cards = type === 'Lab Technician' ? [['Awaiting Analysis', awaiting.length, 'Samples queued for laboratory work'], ['Analyzed Samples', scopedSamples.filter(sample => sample.status === 'Analyzed').length, 'Profiles recorded'], ['DNA Matches', scopedMatches.length, 'Comparison records'], ['High-confidence Matches', high.length, 'Investigation review required']] : type === 'Officer' ? [['My Active Cases', activeCases.length, 'Currently active investigations'], ['Pending Cases', scopedCases.filter(caseItem => caseItem.status === 'Pending').length, 'Awaiting evidence or action'], ['Samples Awaiting Results', awaiting.length, 'Assigned to laboratory'], ['New DNA Matches', scopedMatches.filter(match => match.status === 'Pending Review').length, 'Awaiting review']] : [['Missing Persons', data.missingPeople.length, 'Current registry'], ['Active Cases', activeCases.length, 'Open investigations'], ['DNA Samples', data.samples.length, 'Collection records'], ['High-confidence Matches', high.length, 'DNA comparison results']]
+
+  // Officer / Lab Technician dashboard er data load
+  // DNA sample/match API backend e-i role onujayi scoped (officer = nijer case, technician = nijer lab)
+  useEffect(() => {
+    if (type !== 'Officer' && type !== 'Lab Technician') return
+    let mounted = true
+    setRoleLoading(true)
+    setRoleError(null)
+    Promise.all([
+      getSamples(),
+      getMatches(),
+      type === 'Officer' ? caseService.getCases() : Promise.resolve([]),
+      type === 'Lab Technician' ? getLabSummary() : Promise.resolve(null),
+    ])
+      .then(([samples, matches, cases, labSummary]) => {
+        if (!mounted) return
+        // Case API ekhono officer-scoped na, tai ekhane nijer officerId diye filter
+        const myCases = cases.filter(caseItem => String(caseItem.officerId) === String(user?.officerId))
+        setRoleData({ samples, matches, cases: myCases, labSummary })
+      })
+      .catch(err => {
+        console.error('Failed to load dashboard data', err)
+        if (mounted) setRoleError(err.response?.data?.message || 'Failed to load dashboard data')
+      })
+      .finally(() => { if (mounted) setRoleLoading(false) })
+    return () => { mounted = false }
+  }, [type, user?.officerId])
+
+  const { cases, samples, matches, labSummary } = roleData
+  const activeCases = cases.filter(caseItem => caseItem.status === 'Active')
+  const pendingSamples = samples.filter(isPendingAnalysis) // Awaiting + In Analysis
+  const reviewed = matches.filter(match => match.matchStatus === 'Confirmed' || match.matchStatus === 'Rejected')
+  const high = matches.filter(match => match.confidenceLevel === 'High')
+  const loadingValue = value => (roleLoading ? '…' : value)
+
+  // Role onujayi card: [label, value, hint]
+  const cards = type === 'Lab Technician'
+    ? [
+      ['Awaiting Analysis', loadingValue(labSummary?.awaitingAnalysis ?? 0), 'Samples queued for laboratory work'],
+      ['Analyzed Samples', loadingValue(labSummary?.analyzed ?? 0), 'Profiles recorded'],
+      ['DNA Matches', loadingValue(matches.length), 'Comparison records'],
+      ['High-confidence Matches', loadingValue(high.length), 'Investigation review required'],
+    ]
+    : [
+      ['My Active Cases', loadingValue(activeCases.length), 'Currently active investigations'],
+      ['Pending Cases', loadingValue(cases.filter(caseItem => caseItem.status === 'Pending').length), 'Awaiting evidence or action'],
+      ['Samples Awaiting Results', loadingValue(pendingSamples.length), 'Assigned to laboratory'],
+      ['New DNA Matches', loadingValue(matches.filter(match => match.matchStatus === 'Pending Review').length), 'Awaiting review'],
+    ]
 
     const adminCards = [
       ['Solved Cases', caseSummary ? caseSummary.solvedCases : (adminLoading ? 'Loading...' : '—'), 'Investigations marked solved'],
@@ -58,7 +105,12 @@ export function Dashboard({ type }) {
       ['Police Stations', adminCounts ? adminCounts.policeStationCount : (adminLoading ? 'Loading...' : '—'), 'Registered stations'],
       ['DNA Labs', adminCounts ? adminCounts.dnaLabCount : (adminLoading ? 'Loading...' : '—'), 'Registered DNA laboratories'],
     ]
-  const activity = type === 'Lab Technician' ? awaiting.map(sample => [sample.id, sample.person, '—', sample.status, `/dna-samples/${sample.id}`]) : scopedCases.slice(0, 6).map(caseItem => [caseItem.id, caseItem.person, caseItem.priority, caseItem.status, `/cases/${caseItem.id}`])
+
+  // Table row: [record, subject, third column, status, link]
+  // Technician: analysis baki sample (third = sample type), Officer: nijer recent case (third = priority)
+  const activity = type === 'Lab Technician'
+    ? pendingSamples.map(sample => [`#${sample.id}`, sample.familyMemberName ? `${sample.familyMemberName} (${sample.familyRelationship})` : sample.personName, sample.sampleType, sample.status, `/dna-samples/${sample.id}`])
+    : cases.slice(0, 6).map(caseItem => [`#${caseItem.id}`, caseItem.missingPersonName || `Person #${caseItem.personId}`, caseItem.priority, caseItem.status, `/cases/${caseItem.id}`])
 
   // Render Admin dashboard with API-driven cards
   if (type === 'Admin') {
@@ -70,21 +122,27 @@ export function Dashboard({ type }) {
     </>
   }
 
-  // Non-admin (Officer / Lab Technician) — keep existing mock-driven UI
+  // Non-admin (Officer / Lab Technician) — real API data diye (Member 1 - Issue 7)
+  const isTechnician = type === 'Lab Technician'
   return <>
-    <PageHeader title={`${type === 'Lab Technician' ? 'Laboratory' : type} Dashboard`} subtitle={type === 'Officer' ? 'Your investigation workload and linked DNA identification updates.' : type === 'Lab Technician' ? `Laboratory work assigned to ${assignedLab || 'your lab'}.` : 'Forensic investigation overview.'} action={type === 'Officer' ? <Link to="/missing-persons/new" className="btn btn-primary">Register Missing Person</Link> : null}/>
+    <PageHeader title={`${isTechnician ? 'Laboratory' : type} Dashboard`} subtitle={type === 'Officer' ? 'Your investigation workload and linked DNA identification updates.' : `Laboratory work assigned to ${labSummary?.labName || 'your lab'}.`} action={type === 'Officer' ? <Link to="/missing-persons/new" className="btn btn-primary">Register Missing Person</Link> : null}/>
+    {roleError && <div className="mb-3 alert alert-danger">{roleError}</div>}
     <div className="row g-3 mb-4">{cards.map((card, index) => <div className="col-sm-6 col-xl-3" key={card[0]}><MetricCard label={card[0]} value={card[1]} hint={card[2]} tone={index === 3 ? 'success' : index === 1 ? 'warning' : 'primary'}/></div>)}</div>
     <div className="row g-4">
       <div className="col-lg-7">
         <div className="card h-100">
-          <div className="card-header bg-white d-flex justify-content-between"><strong>{type === 'Lab Technician' ? 'Samples requiring attention' : 'Recent investigation activity'}</strong><Link to={type === 'Lab Technician' ? '/dna-samples' : '/cases'}>View all</Link></div>
-          <div className="table-responsive"><table className="table table-hover mb-0"><thead><tr><th>Record</th><th>Subject</th><th>Priority</th><th>Status</th></tr></thead><tbody>{activity.map(row => <tr key={row[0]}><td className="fw-semibold"><Link to={row[4]}>{row[0]}</Link></td><td>{row[1]}</td><td>{row[2] !== '—' && <StatusBadge value={row[2]}/>}</td><td><StatusBadge value={row[3]}/></td></tr>)}{!activity.length && <tr><td colSpan="4" className="text-center text-secondary py-4">No records need attention.</td></tr>}</tbody></table></div>
+          <div className="card-header bg-white d-flex justify-content-between"><strong>{isTechnician ? 'Samples requiring attention' : 'Recent investigation activity'}</strong><Link to={isTechnician ? '/dna-samples' : '/cases'}>View all</Link></div>
+          <div className="table-responsive"><table className="table table-hover mb-0"><thead><tr><th>Record</th><th>Subject</th><th>{isTechnician ? 'Sample Type' : 'Priority'}</th><th>Status</th></tr></thead><tbody>
+            {roleLoading && <tr><td colSpan="4" className="text-center text-secondary py-4">Loading...</td></tr>}
+            {!roleLoading && activity.map(row => <tr key={row[0]}><td className="fw-semibold"><Link to={row[4]}>{row[0]}</Link></td><td>{row[1]}</td><td>{isTechnician ? row[2] : row[2] && <StatusBadge value={row[2]}/>}</td><td><StatusBadge value={row[3]}/></td></tr>)}
+            {!roleLoading && !activity.length && <tr><td colSpan="4" className="text-center text-secondary py-4">No records need attention.</td></tr>}
+          </tbody></table></div>
         </div>
       </div>
       <div className="col-lg-5">
         <div className="card h-100">
           <div className="card-header bg-white"><strong>{type === 'Officer' ? 'Investigation summary' : 'DNA result summary'}</strong></div>
-          <div className="card-body">{type === 'Officer' ? <><p className="mb-2"><b>{high.length}</b> high-confidence DNA matches are available across your linked investigations.</p><p className="mb-0 text-secondary small">{awaiting.length} evidence and reference samples are still awaiting analysis.</p></> : <><p className="mb-2"><b>{reviewed.length}</b> DNA comparisons have been reviewed.</p><p className="mb-0 text-secondary small">{high.length} comparison results are marked high confidence.</p></>}</div>
+          <div className="card-body">{type === 'Officer' ? <><p className="mb-2"><b>{high.length}</b> high-confidence DNA matches are available across your linked investigations.</p><p className="mb-0 text-secondary small">{pendingSamples.length} evidence and reference samples are still awaiting analysis.</p></> : <><p className="mb-2"><b>{reviewed.length}</b> DNA comparisons have been reviewed.</p><p className="mb-0 text-secondary small">{high.length} comparison results are marked high confidence.</p></>}</div>
         </div>
       </div>
     </div>
```

## 7.2 `frontend/src/pages/Administration.jsx` (modified: `Reports` export only)

```diff
@@ -7,6 +7,7 @@ import { getUsers, updateUser, updateUserStatus, deleteUser } from '../services/
 import { getOfficers, createOfficer, updateOfficer, deleteOfficer } from '../services/officerService'
 import { getStations, createStation, updateStation, deleteStation } from '../services/policeStationService'
 import caseService from '../services/caseService'
+import { getMatches, getSamples } from '../services/dnaService' // report export er DNA metric real API theke (Member 1 - Issue 7)
 
 const recordConfig = {
   stations: { title: 'Police Stations', subtitle: 'Manage police station records.', button: 'Add Station', fields: [['name', 'Station name'], ['district', 'District'], ['city', 'City'], ['address', 'Address'], ['contact', 'Contact'], ['email', 'Email', 'email']] },
@@ -246,10 +247,16 @@ export function Reports() {
   const avgResolution = caseStats?.summary?.averageResolutionDays ?? null
   const stationStats = caseStats?.stationStatistics ?? []
 
-  const exportReport = () => {
-    const top = [...(data.matches || [])].sort((first, second) => parseFloat(second.similarity || 0) - parseFloat(first.similarity || 0))[0]
-    const analyzed = (data.samples || []).filter(sample => sample.status === 'Analyzed').length
-    const reportCards = [['Highest DNA similarity match', top?.id || '—', top ? `${top.similarity} similarity` : 'No matches'], ['Solved investigations', String(solved), 'Current records'], ['Pending investigations', String(pending), 'Across all police stations'], ['Samples analyzed', String(analyzed), `of ${data.samples.length} collected samples`], ['Total missing-person reports', String(data.missingPeople.length), 'Current registry']]
+  const exportReport = async () => {
+    // DNA sample/match ekhon real API theke (age mock data.samples/data.matches chilo) — Member 1 Issue 7
+    // API fail korle faka list diye export hobe, jate CSV export atke na jay
+    const [dnaSamples, dnaMatches] = await Promise.all([
+      getSamples().catch(() => []),
+      getMatches().catch(() => []),
+    ])
+    const top = [...dnaMatches].sort((first, second) => second.similarityPercentage - first.similarityPercentage)[0] // shob theke beshi similarity
+    const analyzed = dnaSamples.filter(sample => sample.status === 'Analyzed').length
+    const reportCards = [['Highest DNA similarity match', top ? `#${top.id}` : '—', top ? `${top.similarityPercentage}% similarity (${top.matchStatus})` : 'No matches'], ['Solved investigations', String(solved), 'Current records'], ['Pending investigations', String(pending), 'Across all police stations'], ['Samples analyzed', String(analyzed), `of ${dnaSamples.length} collected samples`], ['Total missing-person reports', String(data.missingPeople.length), 'Current registry']]
     const rows = [['ForenTrace Report', new Date().toLocaleDateString()], [], ['Metric', 'Value', 'Detail'], ...reportCards.map(card => [card[0], card[1], card[2]]), [], ['Cases'], ['Case ID', 'Missing Person', 'Status', 'Priority'], ...(data.cases || []).map(caseItem => [caseItem.id, caseItem.person, caseItem.status, caseItem.priority])]
     const csv = rows.map(row => row.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n')
     const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
```

## 7.3 `frontend/src/data/DataContext.jsx` (modified)

```diff
@@ -2,21 +2,17 @@ import { createContext, useContext, useMemo, useState } from 'react'
 import * as seed from './mockData'
 
 const DATA_KEY = 'forentrace-records-v2'
-const collections = ['missingPeople', 'cases', 'familyMembers', 'samples', 'matches', 'stations', 'officers', 'labs', 'technicians']
+// DNA samples ar matches ekhon real backend (/api/dna-samples, /api/dna-matches) theke ashe —
+// tai mock 'samples' ar 'matches' collection ekhan theke baad deya hoyeche (Member 1 - Issue 7)
+const collections = ['missingPeople', 'cases', 'familyMembers', 'stations', 'officers', 'labs', 'technicians']
 const clone = value => JSON.parse(JSON.stringify(value))
 const initialData = () => Object.fromEntries(collections.map(key => [key, clone(seed[key])]))
 const hasCollections = value => collections.every(key => Array.isArray(value?.[key]))
 
 function normalizeRecords(records) {
-  const familyMembers = records.familyMembers.map(member => ({ ...member, sample: member.sample || '—' }))
-  const samples = records.samples.map(sample => {
-    const familyMember = familyMembers.find(member => member.id === sample.familyMemberId || member.name === sample.person)
-    const relatedCase = records.cases.find(item => item.id === sample.caseId) || records.cases.find(item => item.personId === sample.personId)
-    return { ...sample, familyMemberId: sample.familyMemberId || familyMember?.id || '', caseId: sample.caseId || relatedCase?.id || '', analysis: sample.analysis || '—', profile: sample.profile || '—', remarks: sample.remarks || '' }
-  })
-  const sampleIds = new Set(samples.map(sample => sample.id))
-  const matches = records.matches.filter(match => sampleIds.has(match.unknown) && sampleIds.has(match.matched))
-  return { ...records, familyMembers: familyMembers.map(member => ({ ...member, sample: samples.find(sample => sample.familyMemberId === member.id)?.id || member.sample })), samples, matches }
+  // Purono localStorage e thaka mock samples/matches bad dei (kono page ar egulo use kore na)
+  const { samples: _samples, matches: _matches, ...rest } = records
+  return rest
 }
 
 function readData() {
@@ -50,7 +46,7 @@ export function DataProvider({ children }) {
       return record
     },
     addFamilyMember(values) {
-      const record = { ...values, id: nextId('FM', data.familyMembers), sample: '—' }
+      const record = { ...values, id: nextId('FM', data.familyMembers) }
       commit({ ...data, familyMembers: [...data.familyMembers, record] })
       return record
     },
@@ -63,18 +59,7 @@ export function DataProvider({ children }) {
     updateCase(id, values) {
       commit({ ...data, cases: data.cases.map(item => item.id === id ? { ...item, ...values, identifiedDate: values.identifiedDate || '—' } : item) })
     },
-    addSample(values) {
-      const owner = values.familyMemberId ? data.familyMembers.find(item => item.id === values.familyMemberId) : data.missingPeople.find(item => item.id === values.personId)
-      const record = { ...values, id: nextId('SMP', data.samples), person: owner?.name || (owner ? `${owner.firstName} ${owner.lastName}` : 'Unassigned'), status: 'Awaiting Analysis', analysis: '—', profile: '—' }
-      commit({ ...data, samples: [...data.samples, record], familyMembers: values.familyMemberId ? data.familyMembers.map(member => member.id === values.familyMemberId ? { ...member, sample: record.id } : member) : data.familyMembers })
-      return record
-    },
-    updateSample(id, values) {
-      commit({ ...data, samples: data.samples.map(item => item.id === id ? { ...item, ...values } : item) })
-    },
-    updateMatch(id, values) {
-      commit({ ...data, matches: data.matches.map(item => item.id === id ? { ...item, ...values } : item) })
-    },
+    // addSample / updateSample / updateMatch (mock) remove kora hoyeche — DNA er shob kaj ekhon dnaService diye real API te
     addAdminRecord(kind, values) {
       const prefix = { stations: 'PS', officers: 'OFF', labs: 'LAB', technicians: 'TECH' }[kind]
       const record = { ...values, id: nextId(prefix, data[kind]), status: values.status || 'Active' }
@@ -87,7 +72,8 @@ export function DataProvider({ children }) {
     removeAdminRecord(kind, id) {
       const record = data[kind].find(item => item.id === id)
       if (!record) return { ok: false, message: 'Record not found.' }
-      const used = (kind === 'stations' && (data.officers.some(item => item.station === record.name) || data.cases.some(item => item.station === record.name))) || (kind === 'labs' && (data.technicians.some(item => item.lab === record.name) || data.samples.some(item => item.lab === record.name))) || (kind === 'officers' && data.cases.some(item => item.officer === record.name)) || (kind === 'technicians' && data.samples.some(item => item.technician === record.name))
+      // Mock samples na thakay lab/technician er "sample e use hocche" check ekhan theke baad (real check backend er FK RESTRICT kore)
+      const used = (kind === 'stations' && (data.officers.some(item => item.station === record.name) || data.cases.some(item => item.station === record.name))) || (kind === 'labs' && data.technicians.some(item => item.lab === record.name)) || (kind === 'officers' && data.cases.some(item => item.officer === record.name))
       if (used) return { ok: false, message: 'This record is linked to an operational record and cannot be deleted.' }
       commit({ ...data, [kind]: data[kind].filter(item => item.id !== id) })
       return { ok: true }
```

## 7.4 `frontend/src/data/mockData.js` (modified)

```diff
@@ -15,17 +15,7 @@ export const familyMembers = [
   { id: 'FM-3002', personId: 'MP-1042', name: 'Kamal Rahman', relation: 'Father', phone: '+880 1814 401 119', email: 'kamal.rahman@example.com', address: 'Dhanmondi, Dhaka', sample: 'SMP-9022' },
 ]
 
-export const samples = [
-  { id: 'SMP-9021', source: 'Family Member', type: 'Buccal swab', person: 'Sadia Rahman', personId: 'MP-1042', familyMemberId: 'FM-3001', caseId: 'CASE-2026-087', lab: 'Dhaka Forensic DNA Lab', collected: '2026-07-25', storage: 'Cold Storage A-12', analysis: '2026-07-29', profile: 'DNA-7F2A-91C4', remarks: 'Reference sample verified.', status: 'Analyzed' },
-  { id: 'SMP-9022', source: 'Family Member', type: 'Blood sample', person: 'Kamal Rahman', personId: 'MP-1042', familyMemberId: 'FM-3002', caseId: 'CASE-2026-087', lab: 'Dhaka Forensic DNA Lab', collected: '2026-07-25', storage: 'Cold Storage A-13', analysis: '—', profile: '—', remarks: 'Awaiting extraction.', status: 'Awaiting Analysis' },
-  { id: 'SMP-9012', source: 'Unidentified Remains', type: 'Bone sample', person: 'Amina Rahman', personId: 'MP-1042', caseId: 'CASE-2026-087', lab: 'Dhaka Forensic DNA Lab', collected: '2026-07-24', storage: 'Evidence Room A-03', analysis: '2026-07-28', profile: 'DNA-7F2A-91C9', remarks: 'Suitable comparison profile obtained.', status: 'Analyzed' },
-  { id: 'SMP-9018', source: 'Personal Belonging', type: 'Hair strand', person: 'Tanvir Ahmed', personId: 'MP-1041', caseId: 'CASE-2026-086', lab: 'National Forensic Lab', collected: '2026-07-20', storage: 'Evidence Room B-04', analysis: '2026-07-26', profile: 'DNA-8C11-4A90', remarks: 'Suitable profile obtained.', status: 'Analyzed' },
-]
-
-export const matches = [
-  { id: 'MAT-501', unknown: 'SMP-9018', matched: 'SMP-9021', similarity: '96.7%', confidence: 'High', date: '2026-07-30', status: 'Reviewed', lab: 'National Forensic Lab' },
-  { id: 'MAT-500', unknown: 'SMP-9012', matched: 'SMP-9022', similarity: '88.4%', confidence: 'Medium', date: '2026-07-29', status: 'Pending Review', lab: 'Dhaka Forensic DNA Lab' },
-]
+// Mock DNA samples ar matches remove kora hoyeche — ekhon real API (/api/dna-samples, /api/dna-matches) — Member 1 Issue 7
 
 export const stations = [
   { id: 'PS-01', name: 'Dhanmondi Police Station', district: 'Dhaka', city: 'Dhaka', address: 'Road 27, Dhanmondi', contact: '+880 2 913 1941', email: 'dhanmondi@police.gov.bd' },
```

---

## Phase 7 testing

**Search for remaining mock DNA usage:** after the change, a search for `.samples`, `.matches`, `addSample` and `updateMatch` across `frontend/src` only finds the real API data in `FamilyDnaPanel` (the family `samples` array from the backend) and comments. `Laboratory.jsx` and `Dashboards.jsx` don't import `useData`.

**Dashboard data (backend on a test port, logged in as Officer 1 and Technician 1). The same calculations as `Dashboards.jsx` were run on the real API responses:**

| Dashboard | Result |
|---|---|
| Officer 1 | `GET /cases` returned **2** cases (not scoped). After the `officerId` filter: **#1 John Doe (Active / High)**. Cards: Active 1 · Pending 0 · Samples awaiting 1 · New DNA matches 1. Summary: 1 high-confidence match |
| Technician 1 | Lab **Central Forensic DNA Laboratory**. Cards: Awaiting 1 · Analyzed 2 · DNA matches 2 · High-confidence 1. Attention table: **#3 Salma Begum (Mother), Blood Sample, Awaiting Analysis**. Reviewed 1 |

The test users were removed afterwards.

**Frontend:** `oxlint` found no warnings in the changed code. It reported 2 existing warnings in lines I didn't write: the Admin effect's unused `mounted`, and `DataContext` exporting `useData`. `vite build` succeeded. The dashboards were not clicked through in a browser.

---

# Member 1 — Final Summary

## All 7 issues

| Issue | Delivered |
|---|---|
| 1. DNA Sample Management | `dna_samples` table + model/controller/routes + register/view/update/delete pages with role scope (Admin all / Officer own cases / Technician own lab) |
| 2. Family DNA Reference Integration | Family → sample → missing person link (`INSERT ... SELECT`), secured family registration, `FamilyDnaPanel` in Missing Person Details |
| 3. Laboratory DNA Analysis Workflow | Technician-only analysis endpoint (profile code / date / remarks / status only), analysis page, lab queue cards |
| 4. DNA Matching Workflow | `dna_matches` table, SQL string-similarity comparison (recursive CTE) + manual option, compare/create/review/delete, match pages |
| 5. SQL Trigger | `AFTER UPDATE` + `AFTER INSERT` triggers: a Confirmed match → the missing person becomes `Identified` |
| 6. SQL UNION Report | "Matched" UNION "Awaiting Match" sample overview report + page |
| 7. Real backend for the lab frontend | All lab pages and the Officer/Technician dashboards use the API. Mock DNA data removed |

## Raw SQL files (required deliverable)

| File | Contents |
|---|---|
| `database/sql/dna_samples.sql` | Table, CRUD, role-scoped views, validation lookups, family DNA (Issue 2), lab analysis (Issue 3), search/filters |
| `database/sql/dna_matches.sql` | Table, recursive-CTE comparison, computed/manual insert, scoped views, filters, review, delete |
| `database/sql/trigger.sql` | Both identification triggers + self-restoring tests |
| `database/sql/union_report.sql` | UNION report, officer/technician versions, GROUP BY summary, demo |
| `database/sql/compare_dna_samples_procedure.sql` | Extra: comparison stored procedure (IN/OUT params, WHILE loop, SIGNAL) + tests |

## Advanced SQL (Member 1)

| Feature | File | Where it runs |
|---|---|---|
| **Trigger** | `trigger.sql` | Installed by `schema.sql`. Fires when `PUT /api/dna-matches/:id/status` sets Confirmed |
| **UNION** | `union_report.sql` | `GET /api/dna-samples/report/overview` → DNA Sample Report page |

## Things to tell teammates

- **Member 2:**
  - `GET /api/cases` is still not officer-scoped on `main` (Issue 5). The Officer dashboard filters cases in the frontend for now.
  - Phase 2 changed `familyMemberRoutes.js` / `familyMemberController.js` / `familyMemberModel.js` / `FamilyMembersManager.jsx` / `MissingPersons.jsx` (family DNA registration moved to the DNA module).
  - Phase 7 changed the `Reports` export's DNA metrics.
  - `getSamplesByCase` / `getMatchesByCase` in `dnaService` are ready for the Case Details page.
- **Member 3:**
  - All DNA routes already use `requireAuth` + `requireRole`.
  - The DNA/lab mock data is gone from `DataContext`. The stations/officers/labs/technicians mock data is left for your cleanup (Issue 7).

---

# Extra — Stored Procedure `compare_dna_samples`

## Goal

Move the Phase 4 DNA comparison into a **stored procedure** with **IN and OUT parameters**, so the database calculates the similarity itself. The backend only runs `CALL compare_dna_samples(...)`.

(Stored procedures are Member 2's assigned SQL feature, `create_case`. This is an extra procedure in Member 1's DNA module. It adds OUT parameters, local variables, a `WHILE` loop and `SIGNAL` error handling, which `create_case` doesn't use.)

## The procedure

```sql
CALL compare_dna_samples(1, 2, @matching_positions, @code_length, @similarity, @confidence);
SELECT @matching_positions, @code_length, @similarity, @confidence;   -- 10, 11, 90.91, 'High'
```

| Parameter | Direction | Meaning |
|---|---|---|
| `p_unknown_sample_id` | IN | Unknown/evidence sample |
| `p_matched_sample_id` | IN | Reference sample |
| `p_matching_positions` | OUT | Number of positions with the same character |
| `p_code_length` | OUT | Length of the longer profile code |
| `p_similarity` | OUT | `ROUND(matching / length * 100, 2)` |
| `p_confidence` | OUT | ≥ 90 High, ≥ 80 Medium, otherwise Low |

**How it works:**

1. `DECLARE` local variables (the two codes, a loop position, a match counter).
2. `SELECT ... INTO` loads both samples' `dna_profile_code`.
3. If either code is NULL (the sample doesn't exist or isn't analyzed yet), it stops with `SIGNAL SQLSTATE '45000'` and the message *"Both samples must exist and have a DNA profile code."*
4. A `WHILE v_pos <= p_code_length` loop compares `SUBSTRING(code, v_pos, 1)` of both codes and counts the matches.
5. It sets the OUT parameters. The confidence uses a `CASE`.

It uses the **same formula and thresholds** as Phase 4. The recursive-CTE query in `dna_matches.sql` (query 1) stays as the standalone SELECT version, and it was checked to give identical results.

## Files changed

| File | Type | What changed |
|---|---|---|
| `database/sql/compare_dna_samples_procedure.sql` | New | The procedure + tests (seed pair, the spec's ABC example with temporary samples, the error case) |
| `database/schema.sql` | Modified | Creates the procedure on a fresh setup |
| `database/sql/dna_matches.sql` | Modified | Note on query 1: the backend now uses the procedure |
| `backend/models/dnaMatchModel.js` | Modified | `compareProfileCodes` now **CALLs the procedure** instead of running the inline CTE |
| `backend/controllers/dnaMatchController.js` | Modified | Uses the procedure's confidence for computed matches. `validatePair` also returns the sample rows so the preview can show the profile codes |

The API response shape didn't change, so **no frontend changes** were needed. The New DNA Comparison page works as before.

## Backend: why one connection

MySQL returns OUT parameters in **session variables** (`@similarity`, ...). Those exist only on the connection that ran the `CALL`. If the model used `pool.execute` twice, the `SELECT @similarity` could run on a different pooled connection and get NULL. So `compareProfileCodes`:

1. takes one connection with `pool.getConnection()`;
2. runs `CALL compare_dna_samples(?, ?, @matching_positions, @code_length, @similarity, @confidence)`;
3. runs `SELECT @matching_positions, @code_length, @similarity, @confidence` **on the same connection**;
4. calls `connection.release()` in `finally`, even if an error happens.

Member 2's `create_case` model code uses the same approach (one connection for `CALL` + `LAST_INSERT_ID()`).

---

## `database/sql/compare_dna_samples_procedure.sql` (new)

```sql
-- =========================================================
-- ForenTrace: Stored Procedure — compare_dna_samples (Member 1 - Extra)
-- File: database/sql/compare_dna_samples_procedure.sql
--
-- Kaj: duita DNA sample er stored profile code position-by-position compare kore
--      OUT parameter e result ferot dey:
--        p_matching_positions → koto position e character mile
--        p_code_length        → boro code er length
--        p_similarity         → (mile jawa position / length) * 100, 2 decimal
--        p_confidence         → >= 90 'High', >= 80 'Medium', noile 'Low'
--
-- Example: 'ABC12345' vs 'ABC12346' → 7 / 8 → 87.50 → 'Medium'
--
-- Backend: dnaMatchModel.compareProfileCodes() ei procedure CALL kore
--          (POST /api/dna-matches/compare ar computed match create — Issue 4)
-- dna_matches.sql er query 1 (recursive CTE) same formula er standalone query version.
-- =========================================================

USE forentrace_db;

DROP PROCEDURE IF EXISTS compare_dna_samples;

DELIMITER //

CREATE PROCEDURE compare_dna_samples(
    IN  p_unknown_sample_id INT,         -- unknown / evidence sample
    IN  p_matched_sample_id INT,         -- reference sample
    OUT p_matching_positions INT,        -- koto position mile
    OUT p_code_length INT,               -- boro code er length
    OUT p_similarity DECIMAL(5,2),       -- similarity percentage
    OUT p_confidence VARCHAR(10)         -- High / Medium / Low
)
BEGIN
    -- Local variable declare (procedure er vitore kaj korar jonno)
    DECLARE v_unknown_code VARCHAR(100);
    DECLARE v_matched_code VARCHAR(100);
    DECLARE v_pos INT DEFAULT 1;          -- loop er current position
    DECLARE v_matching INT DEFAULT 0;     -- mile jawa position count

    -- 1. Duita sample er profile code variable e ana
    SELECT dna_profile_code INTO v_unknown_code
    FROM dna_samples
    WHERE sample_id = p_unknown_sample_id;

    SELECT dna_profile_code INTO v_matched_code
    FROM dna_samples
    WHERE sample_id = p_matched_sample_id;

    -- 2. Code na thakle (sample nai ba analysis hoyni) error throw — compare kora jabe na
    IF v_unknown_code IS NULL OR v_matched_code IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Both samples must exist and have a DNA profile code.';
    END IF;

    -- 3. Boro code er length porjonto loop
    SET p_code_length = GREATEST(CHAR_LENGTH(v_unknown_code), CHAR_LENGTH(v_matched_code));

    WHILE v_pos <= p_code_length DO
        -- Ei position e duitar character same hole count barao
        -- (choto code er baire gele SUBSTRING '' dey, tai mile na)
        IF SUBSTRING(v_unknown_code, v_pos, 1) = SUBSTRING(v_matched_code, v_pos, 1) THEN
            SET v_matching = v_matching + 1;
        END IF;
        SET v_pos = v_pos + 1;
    END WHILE;

    -- 4. OUT parameter e result set kora
    SET p_matching_positions = v_matching;
    SET p_similarity = ROUND(v_matching / p_code_length * 100, 2);
    SET p_confidence = CASE
        WHEN p_similarity >= 90 THEN 'High'
        WHEN p_similarity >= 80 THEN 'Medium'
        ELSE 'Low'
    END;
END //

DELIMITER ;


-- =========================================================
-- TEST (seed data use kore — shesh e test data delete)
-- =========================================================

-- Test 1: seed sample 1 (John Doe evidence DNA7F2A91C4) vs sample 2 (father DNA7F2A91C9)
-- Expected: 10 / 11 → 90.91 → High
CALL compare_dna_samples(1, 2, @matching_positions, @code_length, @similarity, @confidence);
SELECT @matching_positions AS matching_positions, @code_length AS code_length,
       @similarity AS similarity_percentage, @confidence AS confidence_level;


-- Test 2: spec er example — 'ABC12345' vs 'ABC12346' (duita temporary analyzed sample banie)
INSERT INTO dna_samples (person_id, lab_id, sample_type, collection_date, dna_profile_code, status)
VALUES (1, 1, 'Hair Strand', '2026-03-01', 'ABC12345', 'Analyzed');
SET @test_sample_a = LAST_INSERT_ID();

INSERT INTO dna_samples (person_id, lab_id, sample_type, collection_date, dna_profile_code, status)
VALUES (1, 1, 'Hair Strand', '2026-03-01', 'ABC12346', 'Analyzed');
SET @test_sample_b = LAST_INSERT_ID();

-- Expected: 7 / 8 → 87.50 → Medium
CALL compare_dna_samples(@test_sample_a, @test_sample_b, @matching_positions, @code_length, @similarity, @confidence);
SELECT @matching_positions AS matching_positions, @code_length AS code_length,
       @similarity AS similarity_percentage, @confidence AS confidence_level;

-- Test sample delete (seed data jeno thik thake)
DELETE FROM dna_samples WHERE sample_id IN (@test_sample_a, @test_sample_b);


-- Test 3 (error): sample 3 er ekhono profile code nai (Awaiting Analysis) → SIGNAL error ashbe:
--   "Both samples must exist and have a DNA profile code."
-- Workbench e alada kore run kore dekha jay (error script thamiye dey, tai comment kora):
-- CALL compare_dna_samples(1, 3, @matching_positions, @code_length, @similarity, @confidence);
```

## `database/schema.sql` (modified)

```diff
@@ -281,4 +281,51 @@ BEGIN
           AND status <> 'Identified';
     END IF;
 END //
+DELIMITER ;
+
+-- Stored Procedure: duita DNA sample er profile code compare (Member 1 - Extra)
+-- Raw SQL + test: database/sql/compare_dna_samples_procedure.sql
+-- Backend: dnaMatchModel.compareProfileCodes() → CALL compare_dna_samples(...)
+DROP PROCEDURE IF EXISTS compare_dna_samples;
+DELIMITER //
+CREATE PROCEDURE compare_dna_samples(
+    IN  p_unknown_sample_id INT,
+    IN  p_matched_sample_id INT,
+    OUT p_matching_positions INT,
+    OUT p_code_length INT,
+    OUT p_similarity DECIMAL(5,2),
+    OUT p_confidence VARCHAR(10)
+)
+BEGIN
+    DECLARE v_unknown_code VARCHAR(100);
+    DECLARE v_matched_code VARCHAR(100);
+    DECLARE v_pos INT DEFAULT 1;
+    DECLARE v_matching INT DEFAULT 0;
+
+    SELECT dna_profile_code INTO v_unknown_code FROM dna_samples WHERE sample_id = p_unknown_sample_id;
+    SELECT dna_profile_code INTO v_matched_code FROM dna_samples WHERE sample_id = p_matched_sample_id;
+
+    -- Profile code na thakle compare kora jabe na
+    IF v_unknown_code IS NULL OR v_matched_code IS NULL THEN
+        SIGNAL SQLSTATE '45000'
+            SET MESSAGE_TEXT = 'Both samples must exist and have a DNA profile code.';
+    END IF;
+
+    -- Position-by-position character compare
+    SET p_code_length = GREATEST(CHAR_LENGTH(v_unknown_code), CHAR_LENGTH(v_matched_code));
+    WHILE v_pos <= p_code_length DO
+        IF SUBSTRING(v_unknown_code, v_pos, 1) = SUBSTRING(v_matched_code, v_pos, 1) THEN
+            SET v_matching = v_matching + 1;
+        END IF;
+        SET v_pos = v_pos + 1;
+    END WHILE;
+
+    SET p_matching_positions = v_matching;
+    SET p_similarity = ROUND(v_matching / p_code_length * 100, 2);
+    SET p_confidence = CASE
+        WHEN p_similarity >= 90 THEN 'High'
+        WHEN p_similarity >= 80 THEN 'Medium'
+        ELSE 'Low'
+    END;
+END //
 DELIMITER ;
\ No newline at end of file
```

## `database/sql/dna_matches.sql` (modified)

```diff
@@ -45,6 +45,8 @@ CREATE TABLE IF NOT EXISTS dna_matches (
 
 
 -- 1. Compare two samples (Option 1: string similarity in SQL)
+-- Note: backend ekhon same formula stored procedure diye chalay → compare_dna_samples_procedure.sql
+--       (ei query ta standalone SELECT version — procedure er result er sathe hubohu mile)
 -- WITH RECURSIVE diye 1..N position er ekta list banano hoy (N = boro code er length),
 -- tarpor proti position e SUBSTRING diye character mile kina check kore SUM kora hoy.
 -- Unknown sample = 1 (John Doe er toothbrush evidence), Matched sample = 2 (father er reference)
```

## `backend/models/dnaMatchModel.js` (modified)

```diff
@@ -124,42 +124,34 @@ export async function findMatchById(id, user = null) {
   return rows[0] || null
 }
 
-// Option 1: duita sample er DNA profile code position-by-position compare (recursive CTE — dna_matches.sql query 1)
-// similarity = mile jawa position / boro code er length * 100
+// Option 1: duita sample er DNA profile code position-by-position compare
+// Stored procedure compare_dna_samples (database/sql/compare_dna_samples_procedure.sql) CALL kora hoy
+// similarity = mile jawa position / boro code er length * 100, confidence o procedure-i ber kore
 export async function compareProfileCodes(unknownSampleId, matchedSampleId) {
-  const [rows] = await pool.execute(
-    `
-    WITH RECURSIVE
-    codes AS (
+  // OUT parameter gulo MySQL session variable (@...) e ashe — egulo shudhu OI connection e thake,
+  // tai CALL ar SELECT ekoi connection e korte hobe (pool theke alada connection nile value harabe)
+  const connection = await pool.getConnection()
+  try {
+    await connection.query(
+      'CALL compare_dna_samples(?, ?, @matching_positions, @code_length, @similarity, @confidence)',
+      [unknownSampleId, matchedSampleId]
+    )
+
+    // OUT parameter er value read kora
+    const [rows] = await connection.query(
+      `
       SELECT
-        u.dna_profile_code AS unknown_code,
-        m.dna_profile_code AS matched_code,
-        GREATEST(CHAR_LENGTH(u.dna_profile_code), CHAR_LENGTH(m.dna_profile_code)) AS max_length
-      FROM dna_samples u
-      INNER JOIN dna_samples m ON m.sample_id = ?
-      WHERE u.sample_id = ?
-    ),
-    positions AS (
-      SELECT 1 AS pos
-      UNION ALL
-      SELECT p.pos + 1
-      FROM positions p
-      INNER JOIN codes c ON p.pos < c.max_length
+        @matching_positions AS matching_positions,
+        @code_length AS max_length,
+        @similarity AS similarity_percentage,
+        @confidence AS confidence_level
+      `
     )
-    SELECT
-      c.unknown_code,
-      c.matched_code,
-      c.max_length,
-      SUM(SUBSTRING(c.unknown_code, p.pos, 1) = SUBSTRING(c.matched_code, p.pos, 1)) AS matching_positions,
-      ROUND(SUM(SUBSTRING(c.unknown_code, p.pos, 1) = SUBSTRING(c.matched_code, p.pos, 1)) / c.max_length * 100, 2) AS similarity_percentage
-    FROM codes c
-    CROSS JOIN positions p
-    GROUP BY c.unknown_code, c.matched_code, c.max_length
-    `,
-    [matchedSampleId, unknownSampleId]
-  )
 
-  return rows[0] || null
+    return rows[0] || null
+  } finally {
+    connection.release() // connection pool e ferot
+  }
 }
 
 // Ei duita sample age theke (je kono direction e) compare kora hoyeche kina
```

## `backend/controllers/dnaMatchController.js` (modified)

| Change | Why |
|---|---|
| `validatePair` returns `unknown` / `matched` rows too | The procedure returns numbers only, so the preview takes the profile codes from the samples already loaded for validation |
| `compareSamples` uses `result.confidence_level` | The confidence now comes from the procedure's OUT parameter |
| `createMatch` computed branch uses `result.confidence_level` | Same reason |
| `confidenceFor()` kept only for **Manual** (Option 2) | A manually typed similarity doesn't go through the procedure. Same 90/80 thresholds |

```diff
@@ -14,7 +14,8 @@ export const MATCH_STATUSES = ['Pending Review', 'Confirmed', 'Rejected']
 const REVIEW_STATUSES = ['Confirmed', 'Rejected'] // review e ei duita te change kora jay
 const CONFIDENCE_LEVELS = ['High', 'Medium', 'Low']
 
-// Similarity theke confidence level (dna_matches.sql er CASE er sathe same threshold)
+// Similarity theke confidence level — shudhu Manual (Option 2) similarity er jonno
+// (Computed hole confidence stored procedure compare_dna_samples nijei dey — same threshold)
 function confidenceFor(similarity) {
   if (similarity >= 90) return 'High'
   if (similarity >= 80) return 'Medium'
@@ -137,7 +138,8 @@ async function validatePair(body, user) {
     return { error: { status: 400, message: 'Both samples must be analyzed with a DNA profile code before comparison.' } }
   }
 
-  return { unknownSampleId, matchedSampleId }
+  // Sample row o ferot dei — compare preview te profile code dekhanor jonno
+  return { unknownSampleId, matchedSampleId, unknown, matched }
 }
 
 // GET /api/dna-matches — role onujayi scoped match list
@@ -209,12 +211,12 @@ export async function compareSamples(req, res) {
       comparison: {
         unknownSampleId: pair.unknownSampleId,
         matchedSampleId: pair.matchedSampleId,
-        unknownProfileCode: result.unknown_code,
-        matchedProfileCode: result.matched_code,
-        codeLength: Number(result.max_length),
-        matchingPositions: Number(result.matching_positions),
+        unknownProfileCode: pair.unknown.dna_profile_code,
+        matchedProfileCode: pair.matched.dna_profile_code,
+        codeLength: Number(result.max_length), // procedure er OUT p_code_length
+        matchingPositions: Number(result.matching_positions), // procedure er OUT p_matching_positions
         similarityPercentage: similarity,
-        confidenceLevel: confidenceFor(similarity),
+        confidenceLevel: result.confidence_level, // procedure er OUT p_confidence
         existingMatchId: existing?.match_id ?? null,
       },
     })
@@ -246,6 +248,7 @@ export async function createMatch(req, res) {
     const isManual = manualField.provided && manualField.value !== null && manualField.value !== ''
 
     let similarity
+    let confidenceLevel
     if (isManual) {
       // Manual similarity shudhu Admin/Officer dite parbe — technician ke compute use korte hobe
       if (user.role === 'Lab Technician') {
@@ -257,16 +260,19 @@ export async function createMatch(req, res) {
         return res.status(400).json({ success: false, message: 'Similarity percentage must be a number between 0 and 100.' })
       }
       similarity = Math.round(similarity * 100) / 100 // DECIMAL(5,2) er jonno 2 decimal
+      confidenceLevel = confidenceFor(similarity)
     } else {
+      // Computed: stored procedure CALL — similarity ar confidence duitai procedure theke
       const result = await compareProfileCodes(pair.unknownSampleId, pair.matchedSampleId)
       similarity = Number(result.similarity_percentage)
+      confidenceLevel = result.confidence_level
     }
 
     const match = await dbCreateMatch({
       unknownSampleId: pair.unknownSampleId,
       matchedSampleId: pair.matchedSampleId,
       similarityPercentage: similarity,
-      confidenceLevel: confidenceFor(similarity),
+      confidenceLevel,
       matchMethod: isManual ? 'Manual' : 'Computed',
     })
 
```

---

## Testing

**SQL (local MySQL 8.0):**

| Test | Result |
|---|---|
| `CALL compare_dna_samples(1, 2, ...)` (seed) | 10 / 11 → **90.91 High** |
| Spec example `ABC12345` vs `ABC12346` (2 temporary samples, deleted afterwards) | 7 / 8 → **87.50 Medium** |
| Sample 3 (no profile code) / sample 999 (doesn't exist) | `ER_SIGNAL_EXCEPTION`: "Both samples must exist and have a DNA profile code." |
| **Procedure vs Phase 4 recursive CTE, every ordered pair of analyzed samples** | **12 pairs, 0 mismatches** |
| Re-run `schema.sql` | `information_schema.ROUTINES` lists `compare_dna_samples` + `create_case` |

**API (backend on a test port):**

| Test | Result |
|---|---|
| Admin / Technician compare 1 vs 2 | `DNA7F2A91C4 vs DNA7F2A91C9 → 10/11 = 90.91% High`, existing match 1 (same as before) |
| Compare 6 vs 1 | 3/11 = 27.27% Low |
| Compare with an unanalyzed sample | 400 (validation runs before the procedure) |
| Create a computed match 6 vs 1 | 201 **Computed 27.27% Low** (from the procedure) |
| Create a manual match 81.456 | 201 **Manual 81.46% Medium** (not affected) |
| **10 parallel compare requests** with different pairs | All correct. Each request's session variables stay on its own connection |

Test matches and users were removed afterwards (matches back to #1 Pending Review, #2 Rejected).

## Final summary update

With this extra, Member 1's advanced SQL covers:

| Feature | File | Where it runs |
|---|---|---|
| **Trigger** (assigned) | `trigger.sql` | Confirmed match → `Identified` |
| **UNION** (assigned) | `union_report.sql` | DNA Sample Report |
| **Stored procedure** (extra) | `compare_dna_samples_procedure.sql` | `POST /api/dna-matches/compare` + computed match create |
| Recursive CTE (standalone version) | `dna_matches.sql` query 1 | Reference / verification query |

---

# UI Phase 1 — Black + Teal DNA Theme (branch `ui/m1-ui-upgrade`)

## Goal

Upgrade the look of the **whole project** without rewriting the pages:

- colour scheme **black + teal**, so it feels like a DNA matching / forensic lab system,
- **micro-transitions** (hover, click, focus, page enter),
- **scroll effects** (progress bar, back-to-top, cards reveal on scroll),
- **live elements** (moving DNA helix, A/T/G/C sequencer ticker, live clock),
- a **non-solid background** (moving teal glow + lab grid + scanner line),
- **minimal, beginner-friendly code**: plain CSS in one file + one small component file, existing components reused.

Work is on its own branch (`ui/m1-ui-upgrade`, made from the latest `main`) so teammates working on `main` are not affected.

## Files changed

| File | Type | What changed |
|---|---|---|
| `frontend/index.html` | Modified | `data-bs-theme="dark"` turns on Bootstrap 5.3's built-in dark mode for every page. Real page title |
| `frontend/src/components/DnaEffects.jsx` | **New** | 4 small live components: `DnaHelix`, `DnaTicker`, `LiveClock`, `ScrollProgress` |
| `frontend/src/index.css` | Rewritten | The whole black + teal theme. Keeps **every old class name**, adds colour variables, animated background, Bootstrap overrides, micro-transitions, scroll reveal |
| `frontend/src/layouts/AppLayout.jsx` | Modified | Uses the new components: helix logo, ticker + live clock in the topbar, scroll progress bar |
| `frontend/src/pages/Auth.jsx` | Modified | Login side panel gets the ticker and a big spinning DNA helix |
| `frontend/src/pages/Laboratory.jsx` | Modified (1 line) | DNA code comparison cells: light green / pink → teal glow / soft red, readable on dark |

No backend or database changes.

## How the theme reaches every page (why the change is small)

1. **Bootstrap dark mode** — one attribute (`data-bs-theme="dark"`) makes all Bootstrap parts dark: cards, tables, forms, modals, alerts, dropdowns.
2. **Bootstrap variables → teal** — Bootstrap reads its colours from CSS variables (`--bs-primary`, `--bs-link-color`, …). `index.css` changes those variables, so every `btn-primary`, link, badge, progress bar, checkbox becomes teal without touching the pages.
3. **Old class names kept** — `.sidebar`, `.side-link`, `.topbar`, `.metric-card`, `.page-header`, `.detail-grid`, `.match-hero`, `.login-*` … all still exist, only restyled. So no page JSX needed to change.
4. **Light-only classes fixed in one place** — pages use `bg-white`, `bg-light`, `table-light`, `text-dark`, `btn-light` (made for a light theme). `index.css` re-colours these for dark, instead of editing ~40 lines across pages.

## Live elements & effects

| Effect | Where | How (simple) |
|---|---|---|
| Moving background glow + grid | Every page | `body::before` (fixed layer behind everything), slowly moved with a CSS `@keyframes` |
| Scanner line | Every page | `#root::before`, a soft teal strip that moves top → bottom forever |
| DNA helix (small) | Sidebar logo | `DnaHelix` — each rung is a line with 2 dots, flipped with `scaleX(1 → -1 → 1)`; each rung starts a bit later, so together they look like a twisting helix |
| DNA helix (large) | Login page | Same component, `size="large"` |
| A/T/G/C ticker | Topbar + login | `DnaTicker` — the sequence is written twice and slides left by 50% in a loop, so it never jumps |
| Live clock + pulsing dot | Topbar | `LiveClock` — `setInterval` every 1 s. Kept as its own component, so only the clock re-renders, not the whole page |
| Scanner beam | Topbar bottom edge | `.topbar::after`, a short teal line moving left → right |
| Scroll progress bar | Top of screen | `ScrollProgress` — `window.scrollY / (page height − screen height)` → width % |
| Back-to-top button | Bottom right | Appears after 20% scroll, `window.scrollTo({ top: 0, behavior: 'smooth' })` |
| Cards reveal on scroll | All cards | CSS only: `animation-timeline: view()` — a card fades + slides up as it enters the screen. Wrapped in `@supports`, so browsers without it just show the card normally |
| Page enter | All pages | Page parts fade up one by one (`.content-wrap > *` with small delays) |
| Blinking cursor | Login "AUTHORIZED ACCESS_" | `.eyebrow::after` with `content: '_'` + blink |
| Match score glow pulse | DNA match hero | `.match-score b` text-shadow pulse |

**Micro-transitions:** sidebar links slide right on hover and show a glowing teal bar when active. Cards get a teal border glow on hover. Metric cards and report cards lift up. Buttons glow on hover and press in on click (`scale(.96)`). Inputs glow teal on focus. Table rows light up with a teal left edge on hover. The user avatar grows on hover.

**Forensic touches:** a gel-electrophoresis band pattern on metric cards, a teal "LED" dot before each card title, monospace (JetBrains Mono) for numbers, clock, ticker and labels, a lab-grid background, and the scanner line.

**Accessibility:** if the user has "reduce motion" on in their OS, all animations and transitions are switched off (`prefers-reduced-motion`).

## Design decisions

- **Minimal JS.** All effects are CSS except the four tiny components (clock, ticker, helix, scroll bar). There are no new npm packages.
- **Live components are separate.** The clock ticks every second and the scroll bar updates on every scroll. If that state lived in `AppLayout`, the whole current page would re-render each second. As separate components, only they re-render.
- **`body` is transparent.** The live background is `body::before` with `z-index: -1`. A solid `body` background would be painted **over** it (this happened in testing: the glow was only visible below short pages). So the black colour sits on `:root` (html), and `body` stays transparent.
- **No `transform` left on page wrappers after animation.** The page-enter animation uses `backwards` fill, so after it ends nothing is left on the element. A leftover `transform` would break `position: fixed` modals inside the page (e.g. the Lab Technicians "Link user" modal).
- **Helix size class is `helix-large`, not `large`.** `Auth.jsx` already had a `.login-brand .large` rule (58×58 px for the FT logo). The first version used `large` and the helix got squashed into 58 px, so it was renamed.
- **Card reveal uses the `translate` property, and hover uses `transform`.** These are two different CSS properties, so the scroll animation and the hover lift don't cancel each other.

---

## UI1.1 `frontend/index.html` (modified)

| Change | Why |
|---|---|
| `data-bs-theme="dark"` on `<html>` | Turns on Bootstrap's dark mode for the whole app |
| `<title>` | Was the Vite default `frontend` |

```diff
diff --git a/frontend/index.html b/frontend/index.html
index f94d687..faf9179 100644
--- a/frontend/index.html
+++ b/frontend/index.html
@@ -1,10 +1,10 @@
 <!doctype html>
-<html lang="en">
+<html lang="en" data-bs-theme="dark">
   <head>
     <meta charset="UTF-8" />
     <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
     <meta name="viewport" content="width=device-width, initial-scale=1.0" />
-    <title>frontend</title>
+    <title>ForenTrace — DNA Identification System</title>
   </head>
   <body>
     <div id="root"></div>
```

## UI1.2 `frontend/src/components/DnaEffects.jsx` (new)

| Part | What it does |
|---|---|
| `DnaHelix({ rungs, size })` | Makes `rungs` spans. Each gets a negative `animationDelay` (`index * -0.2s`), so every rung is at a different point of the spin → twisted DNA look. `size` adds class `helix-small` / `helix-large` |
| `SEQUENCE` + `DnaTicker()` | Splits `SEQUENCE + SEQUENCE` into letters, each in a `base-A/T/G/C` span (each base has its own colour). CSS slides the track left by 50% → seamless loop |
| `LiveClock()` | `useState(new Date())` + `setInterval` every 1000 ms. The cleanup (`clearInterval`) stops the timer when the component leaves the screen |
| `ScrollProgress()` | Listens to `scroll`, calculates the % scrolled, sets the bar width. Shows the back-to-top button after 20 % |

```jsx
import { useEffect, useState } from 'react'

// Choto choto "live" UI element gula ekhane — DNA / forensic feel dewar jonno
// (UI upgrade - Member 1). Shob styling index.css e ache.

// 1) DnaHelix — ghurte thaka DNA er sidi (double helix)
// Protiti "rung" holo ekta line, tar dui mathay duita dot.
// Protiti rung er animation ektu por por shuru hoy, tai pura ta pechano DNA er moto dekhay.
export function DnaHelix({ rungs = 6, size = 'small' }) {
  const list = Array.from({ length: rungs }, (_, index) => index) // [0, 1, 2, ...]
  return (
    <div className={`dna-helix helix-${size}`} aria-hidden="true">
      {list.map(index => (
        <span key={index} className="dna-rung" style={{ animationDelay: `${index * -0.2}s` }} />
      ))}
    </div>
  )
}

// 2) DnaTicker — A T G C base gula bam dike cholte thake (sequencer screen er moto)
// Sequence ta duibar boshano hoy, jate loop ta kothao kete na jay.
const SEQUENCE = 'ATGCGTACCTAGGATCCGATCGTAGCTAGGCTTAACGGATCCATGGCTA'

export function DnaTicker() {
  const bases = (SEQUENCE + SEQUENCE).split('')
  return (
    <div className="dna-ticker" aria-hidden="true">
      <div className="dna-ticker-track">
        {bases.map((base, index) => <span key={index} className={`base-${base}`}>{base}</span>)}
      </div>
    </div>
  )
}

// 3) LiveClock — proti second e time update hoy, pashe ekta "live" dot jole-nebhe
// Alada component rakha hoyeche, jate shudhu clock ta re-render hoy, pura page na.
export function LiveClock() {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000) // 1 second por por
    return () => clearInterval(timer) // component chole gele timer bondho
  }, [])

  return (
    <span className="live-status">
      <span className="live-dot" />
      <span>SYSTEM LIVE</span>
      <span className="live-time">{now.toLocaleTimeString()}</span>
    </span>
  )
}

// 4) ScrollProgress — upore ekta teal bar, page koto tuku scroll hoyeche dekhay
// + onek niche gele "back to top" button ashe.
export function ScrollProgress() {
  const [percent, setPercent] = useState(0)

  useEffect(() => {
    const onScroll = () => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight
      setPercent(maxScroll > 0 ? (window.scrollY / maxScroll) * 100 : 0)
    }
    onScroll() // prothom bar o ekbar hishab kori
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <>
      <div className="scroll-progress" style={{ width: `${percent}%` }} />
      {percent > 20 && (
        <button
          type="button"
          className="back-to-top"
          aria-label="Back to top"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          ↑
        </button>
      )}
    </>
  )
}
```

## UI1.3 `frontend/src/index.css` (rewritten)

The old file was a few very long lines. The new file has the same class names, split into readable sections with Banglish comments:

| Section | What it does |
|---|---|
| `:root` variables (`--ft-*`) | All theme colours in one place: black background, teal, borders, text, mono font |
| `:root[data-bs-theme="dark"]` | Bootstrap's own variables re-pointed to black + teal (primary, links, borders, focus ring, text) |
| Live background | `body::before` (glow + grid, `bg-drift`), `#root::before` (scanner line, `scan-down`) |
| App shell | Sticky sidebar with glass gradient, sliding/glowing `.side-link`, sticky blurred `.topbar` with beam, glowing `.user-chip` |
| Live elements | `.dna-helix` / `.dna-rung` (`helix-spin`), `.dna-ticker` (`ticker`), `.live-status` / `.live-dot` (`pulse`), `.scroll-progress`, `.back-to-top` (`pop-in`) |
| Page content | Page-enter `fade-up`, page header gradient title + growing underline, cards, metric cards (gel bands), tables, badges |
| Buttons / forms | `btn-primary`, `btn-outline-primary`, `btn-light` re-coloured. Press + glow micro-transitions. Teal focus glow on inputs |
| Other Bootstrap parts | progress, nav-pills, dropdown, list-group, modal → teal |
| Light-class fixes | `bg-white`, `bg-light`, `text-dark`, `table-light` made dark-friendly (with `!important`, because Bootstrap's utilities use it) |
| Detail / match / report / login | Old classes re-coloured. Match score pulse, blinking eyebrow cursor, login glass card |
| Scroll reveal | `@supports (animation-timeline: view())` + `prefers-reduced-motion: no-preference` → `.content-wrap .card` uses `reveal` |
| Reduce motion | Turns every animation/transition off for users who ask for it |
| Small screens | Existing breakpoints kept. Sidebar becomes non-sticky on phones, ticker/clock hidden when there's no room |

```css
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap');

/* =====================================================================
   ForenTrace theme — Black + Teal (DNA / forensic lab look)
   UI upgrade (Member 1). Shob rong ekhane variable hishebe rakha,
   rong bodlate chaile shudhu ei jaygay bodlalei hobe.
   ===================================================================== */
:root {
  --ft-bg: #040809;                          /* main kalo background */
  --ft-surface: rgba(10, 22, 24, 0.82);      /* card er background (ektu transparent) */
  --ft-surface-solid: #0a1618;               /* same, but solid */
  --ft-border: rgba(45, 212, 191, 0.14);     /* halka teal border */
  --ft-border-strong: rgba(45, 212, 191, 0.45);
  --ft-teal: #14b8a6;                        /* main teal */
  --ft-teal-light: #2dd4bf;                  /* ujjol teal (glow, link) */
  --ft-teal-glow: rgba(45, 212, 191, 0.35);
  --ft-text: #d5e4e6;                        /* normal lekha */
  --ft-muted: #8aa4a8;                       /* halka lekha */
  --ft-mono: 'JetBrains Mono', Consolas, monospace; /* sequencer / code er font */

  font-family: 'DM Sans', Arial, sans-serif;
  color: var(--ft-text);
  background: var(--ft-bg);
}

/* Bootstrap dark mode er rong gula teal e bodlano (index.html e data-bs-theme="dark" deya ache) */
:root[data-bs-theme="dark"] {
  --bs-body-bg: #040809;
  --bs-body-bg-rgb: 4, 8, 9;
  --bs-body-color: #d5e4e6;
  --bs-body-color-rgb: 213, 228, 230;
  --bs-heading-color: #f0fdfa;
  --bs-emphasis-color: #ffffff;
  --bs-secondary-color: rgba(160, 190, 194, 0.8);
  --bs-secondary-bg: #0c1a1c;
  --bs-tertiary-bg: #081315;
  --bs-border-color: rgba(45, 212, 191, 0.14);
  --bs-border-color-translucent: rgba(45, 212, 191, 0.12);
  --bs-primary: #14b8a6;
  --bs-primary-rgb: 20, 184, 166;
  --bs-primary-text-emphasis: #5eead4;
  --bs-primary-bg-subtle: #042f2c;
  --bs-primary-border-subtle: #0f766e;
  --bs-link-color: #2dd4bf;
  --bs-link-color-rgb: 45, 212, 191;
  --bs-link-hover-color: #99f6e4;
  --bs-link-hover-color-rgb: 153, 246, 228;
  --bs-focus-ring-color: rgba(45, 212, 191, 0.3);
  --bs-font-sans-serif: 'DM Sans', Arial, sans-serif;
}

* { box-sizing: border-box; }
/* body transparent rakha — noile pichoner live background (body::before) dhaka pore jay.
   Kalo rong ta :root (html) e deya ache. */
body { margin: 0; min-width: 320px; background: transparent; }
a { text-decoration: none; transition: color .2s ease; }
::selection { background: rgba(45, 212, 191, 0.35); color: #fff; }

/* Scrollbar o teal */
html { scrollbar-color: #134e4a var(--ft-bg); }
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: var(--ft-bg); }
::-webkit-scrollbar-thumb { background: #134e4a; border-radius: 10px; border: 2px solid var(--ft-bg); }
::-webkit-scrollbar-thumb:hover { background: var(--ft-teal); }

/* ---------------------------------------------------------------------
   Live background (solid na) — shob page er pichone
   body::before = teal alo (glow) + grid, dhire dhire nore
   #root::before = ekta scanner line upor theke niche nambe
   --------------------------------------------------------------------- */
body::before {
  content: '';
  position: fixed;
  inset: -20%;
  z-index: -1;
  pointer-events: none;
  background:
    radial-gradient(circle at 72% 22%, rgba(20, 184, 166, 0.22), transparent 32%),
    radial-gradient(circle at 30% 80%, rgba(8, 145, 178, 0.16), transparent 35%),
    linear-gradient(rgba(45, 212, 191, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(45, 212, 191, 0.05) 1px, transparent 1px);
  background-size: 100% 100%, 100% 100%, 42px 42px, 42px 42px;
  animation: bg-drift 22s ease-in-out infinite alternate;
}

#root::before {
  content: '';
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  height: 140px;
  z-index: -1;
  pointer-events: none;
  background: linear-gradient(to bottom, transparent, rgba(45, 212, 191, 0.07), transparent);
  animation: scan-down 9s linear infinite;
}

@keyframes bg-drift {
  from { transform: translate(0, 0) rotate(0deg); }
  to { transform: translate(4%, -3%) rotate(3deg); }
}
@keyframes scan-down {
  from { transform: translateY(-140px); }
  to { transform: translateY(100vh); }
}

/* ---------------------------------------------------------------------
   App shell: sidebar + topbar
   --------------------------------------------------------------------- */
.app-shell { display: flex; min-height: 100vh; }

/* Sidebar scroll korleo ek jaygay thake (sticky) */
.sidebar {
  width: 255px;
  flex: 0 0 255px;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
  background: linear-gradient(180deg, rgba(2, 6, 7, 0.94), rgba(3, 17, 18, 0.94));
  border-right: 1px solid var(--ft-border);
  color: var(--ft-text);
  padding: 1.4rem .85rem;
  display: flex;
  flex-direction: column;
}
.brand { color: white; display: flex; align-items: center; gap: .7rem; font-size: 1.15rem; font-weight: 700; padding: 0 .55rem 1.6rem; }
.brand small { display: block; font-size: .63rem; color: var(--ft-teal-light); letter-spacing: .04em; font-weight: 400; opacity: .85; }
.brand-icon {
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  background: rgba(45, 212, 191, 0.08);
  border: 1px solid var(--ft-border-strong);
  box-shadow: 0 0 14px rgba(45, 212, 191, 0.25);
  color: var(--ft-teal-light);
  border-radius: 10px;
  display: inline-grid;
  place-items: center;
  font-size: .7rem;
  font-weight: 700;
  overflow: hidden;
}
.role-label { margin: 0 .55rem .55rem; text-transform: uppercase; color: var(--ft-teal); font-family: var(--ft-mono); font-size: .66rem; letter-spacing: .12em; }

/* Menu link — hover e dane shore, active hole bam e teal bar jole */
.side-link {
  position: relative;
  display: block;
  color: #9fb8bc;
  border-radius: 8px;
  padding: .62rem .75rem;
  margin: .08rem 0;
  font-size: .88rem;
  transition: background-color .25s ease, color .25s ease, padding-left .25s ease;
}
.side-link::before {
  content: '';
  position: absolute;
  left: 0;
  top: 22%;
  bottom: 22%;
  width: 3px;
  border-radius: 3px;
  background: var(--ft-teal-light);
  box-shadow: 0 0 10px var(--ft-teal-light);
  transform: scaleY(0);
  transition: transform .25s ease;
}
.side-link:hover { background: rgba(45, 212, 191, 0.07); color: #fff; padding-left: 1rem; }
.side-link.active { background: linear-gradient(90deg, rgba(45, 212, 191, 0.18), rgba(45, 212, 191, 0.02)); color: #fff; }
.side-link.active::before { transform: scaleY(1); }
.sidebar-bottom { margin-top: auto; border-top: 1px solid var(--ft-border); padding-top: .7rem; }

.main-content { min-width: 0; flex: 1; }

/* Topbar — upore atkano, pichone blur (glass effect), niche ekta scanner alo chole */
.topbar {
  position: sticky;
  top: 0;
  z-index: 1010;
  overflow: hidden;
  min-height: 64px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 0 2rem;
  background: rgba(3, 8, 9, 0.72);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--ft-border);
}
.topbar::after {
  content: '';
  position: absolute;
  left: 0;
  bottom: 0;
  width: 25%;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--ft-teal-light), transparent);
  animation: beam 5s linear infinite;
}
@keyframes beam {
  from { transform: translateX(-100%); }
  to { transform: translateX(400%); }
}
.topbar-left { display: flex; align-items: center; gap: 1.2rem; min-width: 0; }
.role-switch { width: 135px; }
.user-chip {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--ft-teal-light), #0e7490);
  color: #031312;
  display: grid;
  place-items: center;
  font-size: .72rem;
  font-weight: 700;
  box-shadow: 0 0 12px rgba(45, 212, 191, 0.35);
  transition: transform .2s ease, box-shadow .2s ease;
}
.user-chip:hover { color: #031312; transform: scale(1.08); box-shadow: 0 0 20px rgba(45, 212, 191, 0.6); }

/* ---------------------------------------------------------------------
   Live element gula (components/DnaEffects.jsx)
   --------------------------------------------------------------------- */

/* DNA helix: protiti rung ghore (scaleX 1 -> -1 -> 1), delay er karone pechano dekhay */
.dna-helix { display: flex; flex-direction: column; justify-content: center; gap: 4px; width: 20px; }
.dna-rung {
  position: relative;
  display: block;
  height: 2px;
  width: 100%;
  border-radius: 2px;
  background: linear-gradient(90deg, var(--ft-teal-light), rgba(45, 212, 191, 0.45), #e6fffb);
  animation: helix-spin 2.4s ease-in-out infinite;
}
.dna-rung::before,
.dna-rung::after {
  content: '';
  position: absolute;
  top: -2px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.dna-rung::before { left: -3px; background: var(--ft-teal-light); box-shadow: 0 0 6px var(--ft-teal-light); }
.dna-rung::after { right: -3px; background: #e6fffb; box-shadow: 0 0 6px rgba(230, 255, 251, 0.8); }
.dna-helix.helix-large { width: 110px; gap: 16px; }
.dna-helix.helix-large .dna-rung { height: 3px; }
.dna-helix.helix-large .dna-rung::before,
.dna-helix.helix-large .dna-rung::after { width: 12px; height: 12px; top: -4.5px; }
.dna-helix.helix-large .dna-rung::before { left: -6px; }
.dna-helix.helix-large .dna-rung::after { right: -6px; }
@keyframes helix-spin {
  0%, 100% { transform: scaleX(1); }
  50% { transform: scaleX(-1); }
}

/* A T G C ticker — bam dike cholte thake */
.dna-ticker {
  width: 260px;
  overflow: hidden;
  font-family: var(--ft-mono);
  font-size: .72rem;
  letter-spacing: .22em;
  mask-image: linear-gradient(90deg, transparent, #000 15%, #000 85%, transparent);
}
.dna-ticker-track { display: inline-flex; white-space: nowrap; animation: ticker 24s linear infinite; }
.base-A { color: #2dd4bf; }
.base-T { color: #67e8f9; }
.base-G { color: #ecfeff; }
.base-C { color: #0d9488; }
@keyframes ticker {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); } /* sequence duibar ache, tai ordhek gele abar shuru */
}

/* "SYSTEM LIVE" + clock */
.live-status {
  display: inline-flex;
  align-items: center;
  gap: .5rem;
  padding: .3rem .7rem;
  border: 1px solid var(--ft-border);
  border-radius: 999px;
  background: rgba(45, 212, 191, 0.05);
  color: var(--ft-teal-light);
  font-family: var(--ft-mono);
  font-size: .66rem;
  letter-spacing: .12em;
  white-space: nowrap;
}
.live-time { color: #fff; }
.live-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--ft-teal-light);
  animation: pulse 1.8s ease-out infinite;
}
@keyframes pulse {
  0% { box-shadow: 0 0 0 0 rgba(45, 212, 191, 0.7); }
  100% { box-shadow: 0 0 0 9px rgba(45, 212, 191, 0); }
}

/* Scroll progress bar + back to top button */
.scroll-progress {
  position: fixed;
  top: 0;
  left: 0;
  height: 3px;
  z-index: 1100;
  pointer-events: none;
  background: linear-gradient(90deg, #0d9488, var(--ft-teal-light), #a5f3fc);
  box-shadow: 0 0 12px var(--ft-teal-glow);
  transition: width .1s linear;
}
.back-to-top {
  position: fixed;
  right: 1.5rem;
  bottom: 1.5rem;
  z-index: 1030;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1px solid var(--ft-border-strong);
  background: rgba(4, 12, 13, 0.9);
  color: var(--ft-teal-light);
  font-size: 1.2rem;
  box-shadow: 0 0 16px rgba(45, 212, 191, 0.25);
  animation: pop-in .3s ease;
  transition: transform .2s ease, background-color .2s ease, color .2s ease;
}
.back-to-top:hover { transform: translateY(-3px); background: var(--ft-teal); color: #031312; }
@keyframes pop-in {
  from { opacity: 0; transform: scale(.6); }
  to { opacity: 1; transform: scale(1); }
}

/* ---------------------------------------------------------------------
   Page content
   --------------------------------------------------------------------- */
.content-wrap { padding: 2rem; max-width: 1500px; }

/* Notun page khulle content niche theke fade hoye uthe ashe (microtransition) */
.content-wrap > * { animation: fade-up .5s ease backwards; }
.content-wrap > *:nth-child(2) { animation-delay: .06s; }
.content-wrap > *:nth-child(3) { animation-delay: .12s; }
.content-wrap > *:nth-child(4) { animation-delay: .18s; }
@keyframes fade-up {
  from { opacity: 0; translate: 0 14px; }
  to { opacity: 1; translate: 0 0; }
}

.page-header { position: relative; margin-bottom: 1.55rem; padding-bottom: 1rem; border-bottom: 1px solid var(--ft-border); }
.page-header::after {
  content: '';
  position: absolute;
  left: 0;
  bottom: -1px;
  width: 90px;
  height: 2px;
  background: var(--ft-teal-light);
  box-shadow: 0 0 10px var(--ft-teal-light);
  animation: grow-line .8s ease backwards;
}
@keyframes grow-line {
  from { width: 0; }
}
/* Title e shada theke teal gradient */
.page-header h1 {
  display: inline-block;
  font-size: 1.55rem;
  margin: 0 0 .25rem;
  font-weight: 700;
  background: linear-gradient(90deg, #ffffff, #5eead4);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.text-secondary { color: var(--ft-muted) !important; }

/* Card — halka transparent kalo, hover e teal glow */
.card {
  --bs-card-bg: var(--ft-surface);
  --bs-card-border-color: var(--ft-border);
  --bs-card-cap-bg: rgba(45, 212, 191, 0.04);
  --bs-card-color: var(--ft-text);
  border-radius: 12px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.35);
  transition: border-color .3s ease, box-shadow .3s ease, transform .3s ease;
}
.card:hover { border-color: var(--ft-border-strong); box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4), 0 0 24px rgba(45, 212, 191, 0.08); }
.card-header, .card-footer { border-color: var(--ft-border); }
/* Card title er age ekta choto teal "LED" */
.card-header strong::before {
  content: '';
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-right: .55rem;
  border-radius: 50%;
  vertical-align: middle;
  background: var(--ft-teal-light);
  box-shadow: 0 0 8px var(--ft-teal-light);
}

/* Metric card — upore teal line, kone gel-electrophoresis er moto band, hover e upore uthe */
.metric-card { position: relative; overflow: hidden; }
.metric-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--ft-teal-light), transparent);
}
.metric-card::after {
  content: '';
  position: absolute;
  right: 16px;
  top: 54px;
  width: 44px;
  height: 22px;
  background: repeating-linear-gradient(to bottom, var(--ft-teal-light) 0 2px, transparent 2px 7px);
  opacity: .18;
  transition: opacity .3s ease;
}
.metric-card:hover { transform: translateY(-4px); }
.metric-card:hover::after { opacity: .5; }
.metric-card h2 { font-size: 1.75rem; margin: 0; font-family: var(--ft-mono); color: #fff; text-shadow: 0 0 18px rgba(45, 212, 191, 0.4); }
.metric-mark { float: right; width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; color: #031312; font-weight: 700; }
.metric-mark.primary { background: var(--ft-teal-light); box-shadow: 0 0 12px rgba(45, 212, 191, 0.45); }
.metric-mark.success { background: #34d399; box-shadow: 0 0 12px rgba(52, 211, 153, 0.45); }
.metric-mark.warning { background: #fbbf24; box-shadow: 0 0 12px rgba(251, 191, 36, 0.4); }

/* Table — transparent, hover row e teal alo + bam e teal dag */
.table {
  --bs-table-bg: transparent;
  --bs-table-color: var(--ft-text);
  --bs-table-border-color: var(--ft-border);
  --bs-table-hover-bg: rgba(45, 212, 191, 0.07);
  --bs-table-hover-color: #fff;
  --bs-table-striped-bg: rgba(255, 255, 255, 0.02);
  font-size: .87rem;
}
.table > :not(caption) > * > * { transition: box-shadow .2s ease, color .2s ease; }
.table-hover > tbody > tr:hover > :first-child { box-shadow: inset 3px 0 0 var(--ft-teal-light), inset 0 0 0 9999px var(--bs-table-hover-bg); }
.table thead th { color: #5eead4; font-size: .7rem; text-transform: uppercase; letter-spacing: .07em; white-space: nowrap; opacity: .85; }
.table-light { --bs-table-bg: rgba(45, 212, 191, 0.06); --bs-table-color: #5eead4; --bs-table-border-color: var(--ft-border); }
.status-badge { font-weight: 600; font-size: .7rem; letter-spacing: .03em; border-radius: 999px; padding: .38em .75em; }

/* Button — teal, hover e glow, click e ektu chapa (microtransition) */
.btn { transition: color .2s ease, background-color .2s ease, border-color .2s ease, box-shadow .2s ease, transform .15s ease; }
.btn:not(:disabled):active { transform: scale(.96); }
.btn-primary {
  --bs-btn-color: #031312;
  --bs-btn-bg: var(--ft-teal);
  --bs-btn-border-color: var(--ft-teal);
  --bs-btn-hover-color: #031312;
  --bs-btn-hover-bg: var(--ft-teal-light);
  --bs-btn-hover-border-color: var(--ft-teal-light);
  --bs-btn-active-color: #031312;
  --bs-btn-active-bg: #0d9488;
  --bs-btn-active-border-color: #0d9488;
  --bs-btn-disabled-color: rgba(3, 19, 18, 0.7);
  --bs-btn-disabled-bg: #0f766e;
  --bs-btn-disabled-border-color: #0f766e;
  --bs-btn-focus-shadow-rgb: 45, 212, 191;
  font-weight: 600;
}
.btn-primary:hover { box-shadow: 0 0 18px rgba(45, 212, 191, 0.45); }
.btn-outline-primary {
  --bs-btn-color: var(--ft-teal-light);
  --bs-btn-border-color: rgba(45, 212, 191, 0.5);
  --bs-btn-hover-color: #031312;
  --bs-btn-hover-bg: var(--ft-teal-light);
  --bs-btn-hover-border-color: var(--ft-teal-light);
  --bs-btn-active-color: #031312;
  --bs-btn-active-bg: var(--ft-teal);
  --bs-btn-active-border-color: var(--ft-teal);
  --bs-btn-focus-shadow-rgb: 45, 212, 191;
}
.btn-outline-primary:hover { box-shadow: 0 0 14px rgba(45, 212, 191, 0.35); }
/* btn-light dark theme e shada dekhay, tai eke glass button banano */
.btn-light {
  --bs-btn-color: var(--ft-text);
  --bs-btn-bg: rgba(255, 255, 255, 0.05);
  --bs-btn-border-color: var(--ft-border);
  --bs-btn-hover-color: #fff;
  --bs-btn-hover-bg: rgba(45, 212, 191, 0.12);
  --bs-btn-hover-border-color: var(--ft-border-strong);
  --bs-btn-active-color: #fff;
  --bs-btn-active-bg: rgba(45, 212, 191, 0.2);
  --bs-btn-active-border-color: var(--ft-border-strong);
}

/* Form input — focus korle teal glow */
.form-control,
.form-select {
  background-color: rgba(3, 10, 11, 0.6);
  border-color: var(--ft-border);
  color: var(--ft-text);
  transition: border-color .2s ease, box-shadow .2s ease, background-color .2s ease;
}
.form-control:focus,
.form-select:focus {
  background-color: rgba(3, 10, 11, 0.85);
  border-color: var(--ft-teal-light);
  box-shadow: 0 0 0 .2rem rgba(45, 212, 191, 0.18), 0 0 16px rgba(45, 212, 191, 0.15);
  color: #fff;
}
.form-control::placeholder { color: rgba(160, 190, 194, 0.45); }
.form-label { color: #b8cdd0; font-size: .85rem; }
.form-check-input:checked { background-color: var(--ft-teal); border-color: var(--ft-teal); }
.form-check-input:focus { border-color: var(--ft-teal-light); box-shadow: 0 0 0 .2rem rgba(45, 212, 191, 0.2); }

/* Baki Bootstrap jinish er blue -> teal */
.progress { --bs-progress-bg: rgba(255, 255, 255, 0.06); --bs-progress-bar-bg: var(--ft-teal-light); height: .55rem; }
.progress-bar { box-shadow: 0 0 10px var(--ft-teal-glow); }
.nav-pills { --bs-nav-pills-link-active-bg: var(--ft-teal); --bs-nav-pills-link-active-color: #031312; }
.dropdown-menu { --bs-dropdown-link-active-bg: var(--ft-teal); --bs-dropdown-bg: var(--ft-surface-solid); --bs-dropdown-border-color: var(--ft-border); }
.list-group { --bs-list-group-active-bg: var(--ft-teal); --bs-list-group-active-border-color: var(--ft-teal); --bs-list-group-bg: transparent; }
.modal { --bs-modal-bg: var(--ft-surface-solid); --bs-modal-border-color: var(--ft-border-strong); }
.modal-content { box-shadow: 0 0 40px rgba(45, 212, 191, 0.15); }

/* Kichu page e bg-white / bg-light / text-dark lekha ache — dark theme e egulo thik kora */
.bg-white, .bg-light { background-color: var(--ft-surface-solid) !important; color: var(--ft-text); }
.card-header.bg-white, .card-footer.bg-white { background-color: rgba(45, 212, 191, 0.04) !important; }
.text-dark:not(.bg-info):not(.bg-warning) { color: var(--ft-text) !important; }

/* ---------------------------------------------------------------------
   Detail / match / report page er purono class
   --------------------------------------------------------------------- */
.detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.2rem 2rem; }
.detail-grid span { font-size: .75rem; color: var(--ft-muted); text-transform: uppercase; letter-spacing: .05em; }
.detail-grid b { display: block; margin-top: .2rem; color: #f0fdfa; font-size: .9rem; }
.person-placeholder {
  height: 205px;
  display: grid;
  place-items: center;
  background:
    linear-gradient(rgba(45, 212, 191, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(45, 212, 191, 0.06) 1px, transparent 1px),
    radial-gradient(circle, rgba(20, 184, 166, 0.25), rgba(3, 10, 11, 0.9));
  background-size: 20px 20px, 20px 20px, 100% 100%;
  color: var(--ft-teal-light);
  text-shadow: 0 0 20px var(--ft-teal-glow);
  font-size: 3rem;
  font-weight: 700;
}
.bar-row { display: grid; grid-template-columns: 80px 1fr 35px; gap: .7rem; align-items: center; font-size: .83rem; margin: .9rem 0; }
.eyebrow { font-size: .68rem; color: var(--ft-teal-light); letter-spacing: .14em; font-weight: 600; font-family: var(--ft-mono); }
.eyebrow::after { content: '_'; animation: blink 1s steps(1) infinite; } /* terminal er moto blink kora cursor */
@keyframes blink {
  50% { opacity: 0; }
}
.match-hero { background: rgba(4, 30, 30, 0.6); }
.match-hero .card-body { display: flex; justify-content: space-between; align-items: center; text-align: center; padding: 2rem 8%; }
.match-hero h3 { margin: .4rem 0 0; }
.match-score b { display: block; color: var(--ft-teal-light); font-size: 2.2rem; font-family: var(--ft-mono); animation: glow-pulse 2.5s ease-in-out infinite; }
.match-score span { display: block; color: var(--ft-muted); margin-bottom: .5rem; }
@keyframes glow-pulse {
  0%, 100% { text-shadow: 0 0 8px rgba(45, 212, 191, 0.3); }
  50% { text-shadow: 0 0 24px rgba(45, 212, 191, 0.8); }
}
.profile-avatar { width: 82px; height: 82px; border-radius: 50%; display: grid; place-items: center; margin: auto; background: rgba(45, 212, 191, 0.1); border: 1px solid var(--ft-border-strong); box-shadow: 0 0 20px rgba(45, 212, 191, 0.2); color: var(--ft-teal-light); font-weight: 700; font-size: 1.4rem; }
.report-card p { min-height: 2.4em; }
.report-card h3 { font-size: 1.35rem; }
.report-card:hover { transform: translateY(-4px); }

/* ---------------------------------------------------------------------
   Login page
   --------------------------------------------------------------------- */
.login-page { min-height: 100vh; display: grid; grid-template-columns: 42% 58%; }
.login-brand {
  position: relative;
  overflow: hidden;
  background: linear-gradient(160deg, rgba(2, 7, 8, 0.95), rgba(4, 32, 31, 0.85));
  border-right: 1px solid var(--ft-border);
  color: white;
  padding: max(12vh, 5rem) 14%;
}
.login-brand h1 {
  margin: 1rem 0 .1rem;
  font-size: 2.5rem;
  background: linear-gradient(90deg, #ffffff, #5eead4);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.login-brand p { color: #a7c4c8; max-width: 380px; }
.login-brand .large { width: 58px; height: 58px; font-size: 1rem; }
.login-brand hr { border-color: var(--ft-border-strong); margin: 2rem 0; }
.login-brand .dna-ticker { width: 100%; max-width: 380px; margin-top: 1rem; }
.login-brand .dna-helix { margin: 3.5rem 0 0 8px; }
.login-form-wrap { display: grid; place-items: center; padding: 2rem; }
.login-card {
  width: min(440px, 100%);
  padding: 2.2rem;
  background: var(--ft-surface);
  border: 1px solid var(--ft-border);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(45, 212, 191, 0.08);
  animation: fade-up .6s ease backwards;
}
.login-card h2 { font-size: 1.7rem; margin: .4rem 0 .5rem; color: #f0fdfa; }

/* ---------------------------------------------------------------------
   Scroll effect: card screen e dhukle fade + upore uthe ashe.
   Shudhu je browser e support ache (Chrome / Edge), ar jara motion bondho
   rakheni tader jonno. Na thakle card shadharon vabe dekhabe.
   --------------------------------------------------------------------- */
@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion: no-preference) {
    .content-wrap .card {
      animation: reveal linear both;
      animation-timeline: view();
      animation-range: entry 0% entry 50%;
    }
  }
}
@keyframes reveal {
  from { opacity: 0; translate: 0 30px; }
  to { opacity: 1; translate: 0 0; }
}

/* Je user "reduce motion" on rakhe, tar jonno animation bondho */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}

/* ---------------------------------------------------------------------
   Choto screen
   --------------------------------------------------------------------- */
@media (max-width: 900px) {
  .sidebar { width: 205px; flex-basis: 205px; }
  .content-wrap { padding: 1.25rem; }
  .topbar { padding: 0 1.25rem; }
  .topbar .dna-ticker { display: none; }
}
@media (max-width: 650px) {
  .app-shell { display: block; }
  .sidebar { width: 100%; position: static; height: auto; padding: .8rem; }
  .sidebar nav { display: flex; overflow: auto; }
  .side-link { white-space: nowrap; }
  .sidebar-bottom { display: none; }
  .brand { padding-bottom: .5rem; }
  .role-label { display: none; }
  .live-status { display: none; }
  .login-page { grid-template-columns: 1fr; }
  .login-brand { padding: 3rem 10%; }
  .login-brand .dna-helix { display: none; }
  .detail-grid { grid-template-columns: 1fr; }
  .match-hero .card-body { padding: 1.5rem; gap: 1rem; }
  .match-hero h3 { font-size: 1rem; }
}
```

## UI1.4 `frontend/src/layouts/AppLayout.jsx` (modified)

| Change | What it does |
|---|---|
| `import { DnaHelix, DnaTicker, LiveClock, ScrollProgress }` | New live components |
| `<ScrollProgress />` | Teal progress bar at the top + back-to-top button |
| `brand-icon` → `<DnaHelix rungs={5} />` | The "FT" text logo becomes a small spinning helix |
| `topbar-left` with `<DnaTicker />` | Sequencer ticker next to the "Authorized forensic records system" text |
| `<LiveClock />` | "● SYSTEM LIVE hh:mm:ss" pill before the user name |

```diff
diff --git a/frontend/src/layouts/AppLayout.jsx b/frontend/src/layouts/AppLayout.jsx
index 5e9e3f3..1d689c6 100644
--- a/frontend/src/layouts/AppLayout.jsx
+++ b/frontend/src/layouts/AppLayout.jsx
@@ -1,5 +1,6 @@
 import { NavLink, Outlet, useNavigate } from 'react-router-dom'
 import { useAuth } from '../context/AuthContext'
+import { DnaHelix, DnaTicker, LiveClock, ScrollProgress } from '../components/DnaEffects' // live UI element (UI upgrade)
 
 const navByRole = {
   Admin: [
@@ -51,9 +52,10 @@ export default function AppLayout() {
 
   return (
     <div className="app-shell">
+      <ScrollProgress />
       <aside className="sidebar">
         <NavLink to="/" className="brand">
-          <span className="brand-icon">FT</span>
+          <span className="brand-icon"><DnaHelix rungs={5} /></span>
           <span>ForenTrace<small>DNA Identification System</small></span>
         </NavLink>
         <div className="role-label">{role} portal</div>
@@ -75,8 +77,12 @@ export default function AppLayout() {
       </aside>
       <main className="main-content">
         <header className="topbar">
-          <span className="text-secondary small">Authorized forensic records system</span>
-          <div className="d-flex align-items-center gap-2">
+          <div className="topbar-left">
+            <span className="text-secondary small">Authorized forensic records system</span>
+            <DnaTicker />
+          </div>
+          <div className="d-flex align-items-center gap-3">
+            <LiveClock />
             <span className="small text-secondary d-none d-sm-inline">{user?.name}</span>
             <NavLink to="/profile" className="user-chip" aria-label="My profile">{user?.initials}</NavLink>
           </div>
```

## UI1.5 `frontend/src/pages/Auth.jsx` (modified)

| Change | What it does |
|---|---|
| `<DnaTicker />` under the subtitle | A/T/G/C ticker on the login panel |
| `<DnaHelix rungs={12} size="large" />` | Big spinning helix under the description (hidden on phones) |

```diff
diff --git a/frontend/src/pages/Auth.jsx b/frontend/src/pages/Auth.jsx
index ff8a123..79e19ec 100644
--- a/frontend/src/pages/Auth.jsx
+++ b/frontend/src/pages/Auth.jsx
@@ -6,6 +6,7 @@ import { registerUser, registerOfficer } from '../services/authService'
 import { getStations } from '../services/policeStationService'
 import { useData } from '../data/DataContext'
 import { dashboardPath } from '../utils/auth'
+import { DnaHelix, DnaTicker } from '../components/DnaEffects' // DNA animation (UI upgrade)
 
 export const REGISTERABLE_ROLES = ['Officer', 'Lab Technician']
 
@@ -154,11 +155,14 @@ export default function Login() {
         <div className="brand-icon large">FT</div>
         <h1>ForenTrace</h1>
         <p>DNA Identification System</p>
+        <DnaTicker />
         <hr />
         <p className="small">
           Centralized management for missing-person investigations,
           forensic DNA samples, and identification records.
         </p>
+        {/* Boro ghurte thaka DNA helix — login page er decoration (UI upgrade) */}
+        <DnaHelix rungs={12} size="large" />
       </section>
 
       <section className="login-form-wrap">
```

## UI1.6 `frontend/src/pages/Laboratory.jsx` (modified: 1 line + comment)

`CodeComparison` shows two DNA profile codes position by position. Its inline colours were light green / light pink. On the dark theme the text became light-on-light and hard to read. Now matching positions are teal glow and mismatches are soft red, with matching text colours.

```diff
diff --git a/frontend/src/pages/Laboratory.jsx b/frontend/src/pages/Laboratory.jsx
index 7431afd..1ecb9d5 100644
--- a/frontend/src/pages/Laboratory.jsx
+++ b/frontend/src/pages/Laboratory.jsx
@@ -499,7 +499,8 @@ const sampleLabel = sample => `#${sample.id} — ${sampleProvider(sample)} · ${
 function CodeComparison({ first, second }) {
   const length = Math.max(first?.length || 0, second?.length || 0)
   const positions = Array.from({ length }, (_, index) => index)
-  const cell = (char, same) => ({ display: 'inline-block', width: '1.6rem', textAlign: 'center', fontFamily: 'monospace', fontWeight: 600, borderRadius: 4, margin: 1, padding: '2px 0', background: same ? '#d1e7dd' : '#f8d7da' })
+  // Dark theme er jonno: mile gele teal glow, na mille lal (UI upgrade)
+  const cell = (char, same) => ({ display: 'inline-block', width: '1.6rem', textAlign: 'center', fontFamily: 'monospace', fontWeight: 600, borderRadius: 4, margin: 1, padding: '2px 0', background: same ? 'rgba(45, 212, 191, 0.2)' : 'rgba(248, 113, 113, 0.16)', color: same ? '#5eead4' : '#fca5a5' })
   return (
     <div className="overflow-auto">
       {[first, second].map((code, row) => (
```

---

## UI Phase 1 testing

| Test | Result |
|---|---|
| `npm run build` | ✅ Builds (the only warning is the old "chunk > 500 kB") |
| `oxlint` on changed files | ✅ Only the old `REGISTERABLE_ROLES` fast-refresh warning in `Auth.jsx` (was already there) |
| Login page screenshot (headless Edge) | ✅ Black + teal, glass card, ticker, big twisting helix, blinking cursor, grid + glow background |
| Admin dashboard / Cases / DNA Samples screenshots (fake API data, only for screenshots) | ✅ Sticky sidebar with glowing active link, helix logo, ticker, live clock, teal table headers, glowing metric cards, `bg-white` card headers now dark |
| Scroll test (DNA Samples) | ✅ Progress bar fills at the top, back-to-top button appears |
| Found & fixed during testing | Solid `body` hid the live background → `body` made transparent. Helix squashed by the old `.login-brand .large` rule → renamed to `helix-large`. Gel bands overlapped hint text → moved up. Logo subtitle wrapped → normal font |

## Known gaps after UI Phase 1

| Page | Problem | Suggested next step |
|---|---|---|
| `DnaAnalyticsDashboard.jsx` | Styled with ~75 **inline** light colours (not Bootstrap), so the theme can't reach it. Its table header and "Relational Mapping" bar are light-on-light. `/dna-analytics` is also declared at the top level of `AppRoutes.jsx` (line 74, outside `AppLayout`) and that route is the one that renders, so the page shows with no sidebar/topbar | Convert the inline styles to Bootstrap classes (`card`, `table`, `nav-tabs`). They would then follow the theme automatically |
| `PoliceStations.jsx` | Uses **Tailwind** class names (`fixed inset-0`, `rounded-lg`, `divide-y`…), but Tailwind is not installed, so its modals/layout were already unstyled before this phase | Convert to Bootstrap classes |
| Back-to-top position | Sits bottom-right. The chatbot widget (other branch) may also sit bottom-right | Move one of them when the chatbot is merged |
| Scroll reveal | Only works in browsers with scroll-driven animations (Chrome / Edge). Firefox shows cards normally (no animation, nothing broken) | None needed |

---

# UI Phase 1b — Minimal Pass (branch `ui/m1-ui-upgrade`)

## Goal

After UI Phase 1 the look was too busy ("tacky"): neon glows, teal borders everywhere, a scrolling ticker, scanner lines, gradient titles, dots before every card title, gel-band patterns, a blinking cursor. This pass keeps black + teal and the live feel, but makes it **minimal**:

- **neutral first:** black / dark grey surfaces and light grey borders,
- **teal only as an accent:** active menu link, primary button, links, focus ring, small icons,
- **few, quiet live elements:** a small spinning helix logo, a pulsing "live" dot + time, a thin scroll bar, a very faint moving grid.

This section **replaces** the Phase 1 versions of `index.css` and `DnaEffects.jsx`. The full final files are below.

## Files changed

| File | What changed |
|---|---|
| `frontend/src/index.css` | Rewritten calmer (full file below) |
| `frontend/src/components/DnaEffects.jsx` | `DnaTicker` removed. `LiveClock` now shows only a dot + `h:mm` |
| `frontend/src/layouts/AppLayout.jsx` | Ticker removed from the topbar (topbar text is back to the original single span) |
| `frontend/src/pages/Auth.jsx` | Ticker removed from the login panel. Helix 12 → 10 rungs (and faded in CSS) |

## Removed vs kept

| Removed (too loud) | Kept (quiet version) |
|---|---|
| A/T/G/C scrolling ticker | Small helix logo (thinner, softer) |
| Scanner line + topbar beam | Pulsing live dot + time (no pill, muted text) |
| Neon glows / `box-shadow` glows everywhere | Faint grid + one soft teal light, fading out at the bottom (`mask-image`) |
| Teal borders on every card, input and table | Neutral grey borders (`rgba(255,255,255,.08)`) |
| Gradient text on titles, the growing underline | Plain white titles |
| LED dot before card titles, gel bands, top line on metric cards | Metric card lift on hover (2 px) |
| Neon solid metric icons | Soft tinted icons (teal / green / amber at 12% + coloured symbol) |
| Solid bright status badges | **Soft badges**: tinted background + coloured text (`.status-badge.text-bg-*`) |
| Blinking `_` cursor, match-score pulse | Thin 2 px scroll bar, back-to-top, page fade-in, card reveal on scroll |

## `frontend/src/components/DnaEffects.jsx` (final)

| Part | What it does |
|---|---|
| `DnaHelix` | Unchanged (sidebar logo + login panel) |
| `LiveClock` | Dot + `toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })`, e.g. `2:53 PM` |
| `ScrollProgress` | Unchanged |

```jsx
import { useEffect, useState } from 'react'

// Choto choto "live" UI element gula ekhane — DNA / forensic feel dewar jonno
// (UI upgrade - Member 1). Shob styling index.css e ache.

// 1) DnaHelix — ghurte thaka DNA er sidi (double helix)
// Protiti "rung" holo ekta line, tar dui mathay duita dot.
// Protiti rung er animation ektu por por shuru hoy, tai pura ta pechano DNA er moto dekhay.
export function DnaHelix({ rungs = 6, size = 'small' }) {
  const list = Array.from({ length: rungs }, (_, index) => index) // [0, 1, 2, ...]
  return (
    <div className={`dna-helix helix-${size}`} aria-hidden="true">
      {list.map(index => (
        <span key={index} className="dna-rung" style={{ animationDelay: `${index * -0.2}s` }} />
      ))}
    </div>
  )
}

// 2) LiveClock — choto ekta "live" dot + ghonta:minit, 1 second por por update hoy
// Alada component rakha hoyeche, jate shudhu clock ta re-render hoy, pura page na.
export function LiveClock() {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000) // 1 second por por
    return () => clearInterval(timer) // component chole gele timer bondho
  }, [])

  return (
    <span className="live-status" title="System online">
      <span className="live-dot" />
      {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
    </span>
  )
}

// 3) ScrollProgress — upore ekta teal bar, page koto tuku scroll hoyeche dekhay
// + onek niche gele "back to top" button ashe.
export function ScrollProgress() {
  const [percent, setPercent] = useState(0)

  useEffect(() => {
    const onScroll = () => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight
      setPercent(maxScroll > 0 ? (window.scrollY / maxScroll) * 100 : 0)
    }
    onScroll() // prothom bar o ekbar hishab kori
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <>
      <div className="scroll-progress" style={{ width: `${percent}%` }} />
      {percent > 20 && (
        <button
          type="button"
          className="back-to-top"
          aria-label="Back to top"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          ↑
        </button>
      )}
    </>
  )
}
```

## `frontend/src/index.css` (final)

Same sections as Phase 1. The main difference is the variables: `--ft-border` is now neutral grey, and teal is only in `--ft-teal`, `--ft-teal-light` and `--ft-teal-soft` (a 12% teal tint used for active link, icons, avatar).

```css
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

/* =====================================================================
   ForenTrace theme — Black + Teal, minimal
   UI upgrade (Member 1). Rule: shob kichu neutral (kalo/dhushor),
   teal shudhu accent hishebe — active link, primary button, link, focus.
   Rong bodlate chaile shudhu ei variable gula bodlao.
   ===================================================================== */
:root {
  --ft-bg: #060809;                          /* main kalo background */
  --ft-surface: rgba(17, 21, 23, 0.85);      /* card er background */
  --ft-surface-solid: #111517;               /* same, but solid */
  --ft-surface-hover: rgba(255, 255, 255, 0.04);
  --ft-border: rgba(255, 255, 255, 0.08);    /* neutral border */
  --ft-border-hover: rgba(255, 255, 255, 0.16);
  --ft-teal: #14b8a6;                        /* accent */
  --ft-teal-light: #2dd4bf;
  --ft-teal-soft: rgba(45, 212, 191, 0.12);  /* halka teal background */
  --ft-text: #e4e9ea;                        /* normal lekha */
  --ft-muted: #8b9699;                       /* halka lekha */
  --ft-mono: 'JetBrains Mono', Consolas, monospace;

  font-family: 'DM Sans', Arial, sans-serif;
  color: var(--ft-text);
  background: var(--ft-bg);
}

/* Bootstrap dark mode er rong (index.html e data-bs-theme="dark") — blue er jaygay teal */
:root[data-bs-theme="dark"] {
  --bs-body-bg: #060809;
  --bs-body-bg-rgb: 6, 8, 9;
  --bs-body-color: #e4e9ea;
  --bs-body-color-rgb: 228, 233, 234;
  --bs-heading-color: #f4f7f7;
  --bs-emphasis-color: #ffffff;
  --bs-secondary-color: rgba(160, 172, 175, 0.85);
  --bs-secondary-bg: #15191b;
  --bs-tertiary-bg: #0d1011;
  --bs-border-color: rgba(255, 255, 255, 0.08);
  --bs-border-color-translucent: rgba(255, 255, 255, 0.08);
  --bs-primary: #14b8a6;
  --bs-primary-rgb: 20, 184, 166;
  --bs-primary-text-emphasis: #5eead4;
  --bs-primary-bg-subtle: #042f2c;
  --bs-primary-border-subtle: #0f766e;
  --bs-link-color: #2dd4bf;
  --bs-link-color-rgb: 45, 212, 191;
  --bs-link-hover-color: #5eead4;
  --bs-link-hover-color-rgb: 94, 234, 212;
  --bs-focus-ring-color: rgba(45, 212, 191, 0.25);
  --bs-font-sans-serif: 'DM Sans', Arial, sans-serif;
}

* { box-sizing: border-box; }
/* body transparent rakha — noile pichoner background layer (body::before) dhaka pore jay.
   Kalo rong ta :root (html) e deya ache. */
body { margin: 0; min-width: 320px; background: transparent; }
a { text-decoration: none; transition: color .2s ease; }
::selection { background: rgba(45, 212, 191, 0.3); color: #fff; }

/* Scrollbar */
html { scrollbar-color: #2a3134 var(--ft-bg); }
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: var(--ft-bg); }
::-webkit-scrollbar-thumb { background: #2a3134; border-radius: 10px; border: 2px solid var(--ft-bg); }
::-webkit-scrollbar-thumb:hover { background: #3b4448; }

/* ---------------------------------------------------------------------
   Background (solid na, kintu shanto) — upore halka teal alo +
   khub halka lab grid, dhire dhire nore. Niche grid mile jay (mask).
   --------------------------------------------------------------------- */
body::before {
  content: '';
  position: fixed;
  inset: -10%;
  z-index: -1;
  pointer-events: none;
  background:
    radial-gradient(ellipse at 70% 0%, rgba(20, 184, 166, 0.10), transparent 50%),
    linear-gradient(rgba(255, 255, 255, 0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.025) 1px, transparent 1px);
  background-size: 100% 100%, 48px 48px, 48px 48px;
  mask-image: linear-gradient(to bottom, #000 30%, transparent 90%);
  animation: bg-drift 30s ease-in-out infinite alternate;
}
@keyframes bg-drift {
  from { transform: translate(0, 0); }
  to { transform: translate(-3%, 2%); }
}

/* ---------------------------------------------------------------------
   App shell: sidebar + topbar
   --------------------------------------------------------------------- */
.app-shell { display: flex; min-height: 100vh; }

/* Sidebar scroll korleo ek jaygay thake (sticky) */
.sidebar {
  width: 255px;
  flex: 0 0 255px;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
  background: rgba(8, 10, 11, 0.92);
  border-right: 1px solid var(--ft-border);
  color: var(--ft-text);
  padding: 1.4rem .85rem;
  display: flex;
  flex-direction: column;
}
.brand { color: #fff; display: flex; align-items: center; gap: .7rem; font-size: 1.1rem; font-weight: 700; padding: 0 .55rem 1.6rem; }
.brand:hover { color: #fff; }
.brand small { display: block; font-size: .65rem; color: var(--ft-muted); font-weight: 400; letter-spacing: .02em; }
.brand-icon {
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  background: var(--ft-teal-soft);
  color: var(--ft-teal-light);
  border-radius: 9px;
  display: inline-grid;
  place-items: center;
  font-size: .7rem;
  font-weight: 700;
  overflow: hidden;
}
.role-label { margin: 0 .55rem .55rem; text-transform: uppercase; color: var(--ft-muted); font-size: .66rem; letter-spacing: .1em; }

/* Menu link — hover e halka background, active hole teal lekha + bam e patla dag */
.side-link {
  position: relative;
  display: block;
  color: #a3adb0;
  border-radius: 7px;
  padding: .55rem .75rem;
  margin: .06rem 0;
  font-size: .88rem;
  transition: background-color .2s ease, color .2s ease;
}
.side-link::before {
  content: '';
  position: absolute;
  left: 0;
  top: 25%;
  bottom: 25%;
  width: 2px;
  border-radius: 2px;
  background: var(--ft-teal-light);
  transform: scaleY(0);
  transition: transform .2s ease;
}
.side-link:hover { background: var(--ft-surface-hover); color: #fff; }
.side-link.active { background: var(--ft-teal-soft); color: var(--ft-teal-light); }
.side-link.active::before { transform: scaleY(1); }
.sidebar-bottom { margin-top: auto; border-top: 1px solid var(--ft-border); padding-top: .7rem; }

.main-content { min-width: 0; flex: 1; }

/* Topbar — upore atkano, pichone halka blur */
.topbar {
  position: sticky;
  top: 0;
  z-index: 1010;
  min-height: 60px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 0 2rem;
  background: rgba(6, 8, 9, 0.75);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--ft-border);
}
.role-switch { width: 135px; }
.user-chip {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--ft-teal-soft);
  color: var(--ft-teal-light);
  display: grid;
  place-items: center;
  font-size: .7rem;
  font-weight: 700;
  transition: background-color .2s ease;
}
.user-chip:hover { background: rgba(45, 212, 191, 0.22); color: var(--ft-teal-light); }

/* ---------------------------------------------------------------------
   Live element gula (components/DnaEffects.jsx)
   --------------------------------------------------------------------- */

/* DNA helix: protiti rung ghore (scaleX 1 -> -1 -> 1), delay er karone pechano dekhay */
.dna-helix { display: flex; flex-direction: column; justify-content: center; gap: 4px; width: 18px; }
.dna-rung {
  position: relative;
  display: block;
  height: 1.5px;
  width: 100%;
  border-radius: 2px;
  background: rgba(45, 212, 191, 0.4);
  animation: helix-spin 3s ease-in-out infinite;
}
.dna-rung::before,
.dna-rung::after {
  content: '';
  position: absolute;
  top: -2px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
}
.dna-rung::before { left: -2.5px; background: var(--ft-teal-light); }
.dna-rung::after { right: -2.5px; background: #e6fffb; }
.dna-helix.helix-large { width: 90px; gap: 14px; opacity: .55; }
.dna-helix.helix-large .dna-rung { height: 2px; }
.dna-helix.helix-large .dna-rung::before,
.dna-helix.helix-large .dna-rung::after { width: 9px; height: 9px; top: -3.5px; }
.dna-helix.helix-large .dna-rung::before { left: -4.5px; }
.dna-helix.helix-large .dna-rung::after { right: -4.5px; }
@keyframes helix-spin {
  0%, 100% { transform: scaleX(1); }
  50% { transform: scaleX(-1); }
}

/* Live clock — choto dot + shomoy */
.live-status {
  display: inline-flex;
  align-items: center;
  gap: .45rem;
  color: var(--ft-muted);
  font-family: var(--ft-mono);
  font-size: .72rem;
  white-space: nowrap;
}
.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ft-teal-light);
  animation: pulse 2.4s ease-out infinite;
}
@keyframes pulse {
  0% { box-shadow: 0 0 0 0 rgba(45, 212, 191, 0.5); }
  100% { box-shadow: 0 0 0 6px rgba(45, 212, 191, 0); }
}

/* Scroll progress bar + back to top button */
.scroll-progress {
  position: fixed;
  top: 0;
  left: 0;
  height: 2px;
  z-index: 1100;
  pointer-events: none;
  background: var(--ft-teal-light);
  transition: width .1s linear;
}
.back-to-top {
  position: fixed;
  right: 1.5rem;
  bottom: 1.5rem;
  z-index: 1030;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid var(--ft-border-hover);
  background: var(--ft-surface-solid);
  color: var(--ft-text);
  font-size: 1.05rem;
  animation: pop-in .25s ease;
  transition: transform .2s ease, border-color .2s ease, color .2s ease;
}
.back-to-top:hover { transform: translateY(-2px); border-color: var(--ft-teal-light); color: var(--ft-teal-light); }
@keyframes pop-in {
  from { opacity: 0; transform: scale(.7); }
  to { opacity: 1; transform: scale(1); }
}

/* ---------------------------------------------------------------------
   Page content
   --------------------------------------------------------------------- */
.content-wrap { padding: 2rem; max-width: 1500px; }

/* Notun page khulle content halka fade hoye ashe */
.content-wrap > * { animation: fade-up .4s ease backwards; }
.content-wrap > *:nth-child(2) { animation-delay: .05s; }
.content-wrap > *:nth-child(3) { animation-delay: .1s; }
@keyframes fade-up {
  from { opacity: 0; translate: 0 8px; }
  to { opacity: 1; translate: 0 0; }
}

.page-header { margin-bottom: 1.6rem; }
.page-header h1 { font-size: 1.5rem; margin: 0 0 .25rem; font-weight: 700; letter-spacing: -.01em; }
.text-secondary { color: var(--ft-muted) !important; }

/* Card — shanto kalo, hover e border ektu ujjol */
.card {
  --bs-card-bg: var(--ft-surface);
  --bs-card-border-color: var(--ft-border);
  --bs-card-cap-bg: transparent;
  --bs-card-color: var(--ft-text);
  border-radius: 10px;
  transition: border-color .2s ease, transform .2s ease;
}
.card:hover { border-color: var(--ft-border-hover); }
.card-header, .card-footer { border-color: var(--ft-border); }

/* Metric card — boro number, hover e ektu upore */
.metric-card:hover { transform: translateY(-2px); }
.metric-card h2 { font-size: 1.75rem; margin: 0; font-weight: 600; font-variant-numeric: tabular-nums; }
.metric-mark { float: right; width: 26px; height: 26px; border-radius: 7px; display: grid; place-items: center; font-size: .8rem; font-weight: 700; }
.metric-mark.primary { background: var(--ft-teal-soft); color: var(--ft-teal-light); }
.metric-mark.success { background: rgba(52, 211, 153, 0.12); color: #34d399; }
.metric-mark.warning { background: rgba(251, 191, 36, 0.12); color: #fbbf24; }

/* Table — transparent, hover row e halka alo */
.table {
  --bs-table-bg: transparent;
  --bs-table-color: var(--ft-text);
  --bs-table-border-color: var(--ft-border);
  --bs-table-hover-bg: var(--ft-surface-hover);
  --bs-table-hover-color: #fff;
  --bs-table-striped-bg: rgba(255, 255, 255, 0.02);
  font-size: .87rem;
}
.table thead th { color: var(--ft-muted); font-size: .7rem; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; white-space: nowrap; }
.table-light { --bs-table-bg: rgba(255, 255, 255, 0.03); --bs-table-color: var(--ft-muted); --bs-table-border-color: var(--ft-border); }
.status-badge { font-weight: 600; font-size: .7rem; border-radius: 999px; padding: .35em .7em; }
/* Status badge — gadho rong er bodole halka background + rongin lekha (shanto dekhay) */
.status-badge.text-bg-success { background-color: rgba(52, 211, 153, 0.12) !important; color: #34d399 !important; }
.status-badge.text-bg-warning { background-color: rgba(251, 191, 36, 0.12) !important; color: #fbbf24 !important; }
.status-badge.text-bg-primary { background-color: var(--ft-teal-soft) !important; color: var(--ft-teal-light) !important; }
.status-badge.text-bg-danger { background-color: rgba(248, 113, 113, 0.12) !important; color: #f87171 !important; }
.status-badge.text-bg-secondary { background-color: rgba(255, 255, 255, 0.07) !important; color: #b9c2c4 !important; }

/* Button — flat teal, click e ektu chapa (microtransition) */
.btn { transition: color .2s ease, background-color .2s ease, border-color .2s ease, transform .1s ease; }
.btn:not(:disabled):active { transform: scale(.98); }
.btn-primary {
  --bs-btn-color: #04201d;
  --bs-btn-bg: var(--ft-teal);
  --bs-btn-border-color: var(--ft-teal);
  --bs-btn-hover-color: #04201d;
  --bs-btn-hover-bg: var(--ft-teal-light);
  --bs-btn-hover-border-color: var(--ft-teal-light);
  --bs-btn-active-color: #04201d;
  --bs-btn-active-bg: #0d9488;
  --bs-btn-active-border-color: #0d9488;
  --bs-btn-disabled-color: rgba(4, 32, 29, 0.7);
  --bs-btn-disabled-bg: #0f766e;
  --bs-btn-disabled-border-color: #0f766e;
  --bs-btn-focus-shadow-rgb: 45, 212, 191;
  font-weight: 600;
}
.btn-outline-primary {
  --bs-btn-color: var(--ft-teal-light);
  --bs-btn-border-color: rgba(45, 212, 191, 0.4);
  --bs-btn-hover-color: #04201d;
  --bs-btn-hover-bg: var(--ft-teal-light);
  --bs-btn-hover-border-color: var(--ft-teal-light);
  --bs-btn-active-color: #04201d;
  --bs-btn-active-bg: var(--ft-teal);
  --bs-btn-active-border-color: var(--ft-teal);
  --bs-btn-focus-shadow-rgb: 45, 212, 191;
}
/* btn-light dark theme e shada dekhay, tai eke shanto dark button banano */
.btn-light {
  --bs-btn-color: var(--ft-text);
  --bs-btn-bg: rgba(255, 255, 255, 0.05);
  --bs-btn-border-color: var(--ft-border);
  --bs-btn-hover-color: #fff;
  --bs-btn-hover-bg: rgba(255, 255, 255, 0.09);
  --bs-btn-hover-border-color: var(--ft-border-hover);
  --bs-btn-active-color: #fff;
  --bs-btn-active-bg: rgba(255, 255, 255, 0.12);
  --bs-btn-active-border-color: var(--ft-border-hover);
}

/* Form input — focus korle teal border */
.form-control,
.form-select {
  background-color: rgba(255, 255, 255, 0.03);
  border-color: var(--ft-border-hover);
  color: var(--ft-text);
  transition: border-color .2s ease, box-shadow .2s ease;
}
.form-control:focus,
.form-select:focus {
  background-color: rgba(255, 255, 255, 0.04);
  border-color: var(--ft-teal);
  box-shadow: 0 0 0 .2rem rgba(45, 212, 191, 0.15);
  color: #fff;
}
.form-control::placeholder { color: rgba(160, 172, 175, 0.5); }
.form-label { color: #b9c2c4; font-size: .85rem; }
.form-check-input:checked { background-color: var(--ft-teal); border-color: var(--ft-teal); }
.form-check-input:focus { border-color: var(--ft-teal); box-shadow: 0 0 0 .2rem rgba(45, 212, 191, 0.15); }

/* Baki Bootstrap jinish er blue -> teal */
.progress { --bs-progress-bg: rgba(255, 255, 255, 0.06); --bs-progress-bar-bg: var(--ft-teal); height: .5rem; }
.nav-pills { --bs-nav-pills-link-active-bg: var(--ft-teal); --bs-nav-pills-link-active-color: #04201d; }
.nav-tabs { --bs-nav-tabs-border-color: var(--ft-border); --bs-nav-tabs-link-active-color: var(--ft-teal-light); --bs-nav-tabs-link-active-bg: transparent; --bs-nav-tabs-link-active-border-color: var(--ft-border) var(--ft-border) var(--ft-bg); }
.nav-tabs .nav-link { color: var(--ft-muted); font-size: .88rem; }
.nav-tabs .nav-link:hover { color: var(--ft-text); }
.nav-tabs .nav-link.active { color: var(--ft-teal-light); }
.dropdown-menu { --bs-dropdown-link-active-bg: var(--ft-teal); --bs-dropdown-bg: var(--ft-surface-solid); --bs-dropdown-border-color: var(--ft-border); }
.list-group { --bs-list-group-active-bg: var(--ft-teal); --bs-list-group-active-border-color: var(--ft-teal); --bs-list-group-bg: transparent; }
.modal { --bs-modal-bg: var(--ft-surface-solid); --bs-modal-border-color: var(--ft-border-hover); }

/* Kichu page e bg-white / bg-light / text-dark lekha ache — dark theme e egulo thik kora */
.bg-white, .bg-light { background-color: var(--ft-surface-solid) !important; color: var(--ft-text); }
.card-header.bg-white, .card-footer.bg-white { background-color: transparent !important; }
.text-dark:not(.bg-info):not(.bg-warning) { color: var(--ft-text) !important; }

/* ---------------------------------------------------------------------
   Detail / match / report page er purono class
   --------------------------------------------------------------------- */
.detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.2rem 2rem; }
.detail-grid span { font-size: .78rem; color: var(--ft-muted); }
.detail-grid b { display: block; margin-top: .2rem; color: #f4f7f7; font-size: .9rem; }
.person-placeholder { height: 205px; display: grid; place-items: center; background: var(--ft-teal-soft); color: var(--ft-teal-light); font-size: 3rem; font-weight: 700; }
.bar-row { display: grid; grid-template-columns: 80px 1fr 35px; gap: .7rem; align-items: center; font-size: .83rem; margin: .9rem 0; }
.eyebrow { font-size: .68rem; color: var(--ft-teal-light); letter-spacing: .12em; font-weight: 600; }
.match-hero { background: var(--ft-surface-solid); }
.match-hero .card-body { display: flex; justify-content: space-between; align-items: center; text-align: center; padding: 2rem 8%; }
.match-hero h3 { margin: .4rem 0 0; }
.match-score b { display: block; color: var(--ft-teal-light); font-size: 2.2rem; font-variant-numeric: tabular-nums; }
.match-score span { display: block; color: var(--ft-muted); margin-bottom: .5rem; }
.profile-avatar { width: 82px; height: 82px; border-radius: 50%; display: grid; place-items: center; margin: auto; background: var(--ft-teal-soft); color: var(--ft-teal-light); font-weight: 700; font-size: 1.4rem; }
.report-card p { min-height: 2.4em; }
.report-card h3 { font-size: 1.35rem; }
.report-card:hover { transform: translateY(-2px); }

/* ---------------------------------------------------------------------
   Login page
   --------------------------------------------------------------------- */
.login-page { min-height: 100vh; display: grid; grid-template-columns: 42% 58%; }
.login-brand {
  background: rgba(8, 10, 11, 0.9);
  border-right: 1px solid var(--ft-border);
  color: #fff;
  padding: max(12vh, 5rem) 14%;
}
.login-brand h1 { margin: 1rem 0 .1rem; font-size: 2.4rem; font-weight: 700; letter-spacing: -.02em; }
.login-brand p { color: var(--ft-muted); max-width: 380px; }
.login-brand .large { width: 56px; height: 56px; font-size: 1rem; }
.login-brand hr { border-color: var(--ft-border-hover); margin: 2rem 0; }
.login-brand .dna-helix { margin: 3.5rem 0 0 6px; }
.login-form-wrap { display: grid; place-items: center; padding: 2rem; }
.login-card {
  width: min(420px, 100%);
  padding: 2rem;
  background: var(--ft-surface);
  border: 1px solid var(--ft-border);
  border-radius: 14px;
  animation: fade-up .4s ease backwards;
}
.login-card h2 { font-size: 1.6rem; margin: .4rem 0 .5rem; }

/* ---------------------------------------------------------------------
   Scroll effect: card screen e dhukle halka fade + upore uthe ashe.
   Shudhu je browser e support ache (Chrome / Edge), ar jara motion bondho
   rakheni tader jonno. Na thakle card shadharon vabe dekhabe.
   --------------------------------------------------------------------- */
@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion: no-preference) {
    .content-wrap .card {
      animation: reveal linear both;
      animation-timeline: view();
      animation-range: entry 0% entry 40%;
    }
  }
}
@keyframes reveal {
  from { opacity: 0; translate: 0 16px; }
  to { opacity: 1; translate: 0 0; }
}

/* Je user "reduce motion" on rakhe, tar jonno animation bondho */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}

/* ---------------------------------------------------------------------
   Choto screen
   --------------------------------------------------------------------- */
@media (max-width: 900px) {
  .sidebar { width: 205px; flex-basis: 205px; }
  .content-wrap { padding: 1.25rem; }
  .topbar { padding: 0 1.25rem; }
}
@media (max-width: 650px) {
  .app-shell { display: block; }
  .sidebar { width: 100%; position: static; height: auto; padding: .8rem; }
  .sidebar nav { display: flex; overflow: auto; }
  .side-link { white-space: nowrap; }
  .sidebar-bottom { display: none; }
  .brand { padding-bottom: .5rem; }
  .role-label { display: none; }
  .live-status { display: none; }
  .login-page { grid-template-columns: 1fr; }
  .login-brand { padding: 3rem 10%; }
  .login-brand .dna-helix { display: none; }
  .detail-grid { grid-template-columns: 1fr; }
  .match-hero .card-body { padding: 1.5rem; gap: 1rem; }
  .match-hero h3 { font-size: 1rem; }
}
```

## `AppLayout.jsx` and `Auth.jsx` (final diff against `main`)

```diff
diff --git a/frontend/src/layouts/AppLayout.jsx b/frontend/src/layouts/AppLayout.jsx
index 5e9e3f3..af7de37 100644
--- a/frontend/src/layouts/AppLayout.jsx
+++ b/frontend/src/layouts/AppLayout.jsx
@@ -1,5 +1,6 @@
 import { NavLink, Outlet, useNavigate } from 'react-router-dom'
 import { useAuth } from '../context/AuthContext'
+import { DnaHelix, LiveClock, ScrollProgress } from '../components/DnaEffects' // live UI element (UI upgrade)
 
 const navByRole = {
   Admin: [
@@ -51,9 +52,10 @@ export default function AppLayout() {
 
   return (
     <div className="app-shell">
+      <ScrollProgress />
       <aside className="sidebar">
         <NavLink to="/" className="brand">
-          <span className="brand-icon">FT</span>
+          <span className="brand-icon"><DnaHelix rungs={5} /></span>
           <span>ForenTrace<small>DNA Identification System</small></span>
         </NavLink>
         <div className="role-label">{role} portal</div>
@@ -76,7 +78,8 @@ export default function AppLayout() {
       <main className="main-content">
         <header className="topbar">
           <span className="text-secondary small">Authorized forensic records system</span>
-          <div className="d-flex align-items-center gap-2">
+          <div className="d-flex align-items-center gap-3">
+            <LiveClock />
             <span className="small text-secondary d-none d-sm-inline">{user?.name}</span>
             <NavLink to="/profile" className="user-chip" aria-label="My profile">{user?.initials}</NavLink>
           </div>
```

```diff
diff --git a/frontend/src/pages/Auth.jsx b/frontend/src/pages/Auth.jsx
index ff8a123..52ccb87 100644
--- a/frontend/src/pages/Auth.jsx
+++ b/frontend/src/pages/Auth.jsx
@@ -6,6 +6,7 @@ import { registerUser, registerOfficer } from '../services/authService'
 import { getStations } from '../services/policeStationService'
 import { useData } from '../data/DataContext'
 import { dashboardPath } from '../utils/auth'
+import { DnaHelix } from '../components/DnaEffects' // DNA animation (UI upgrade)
 
 export const REGISTERABLE_ROLES = ['Officer', 'Lab Technician']
 
@@ -159,6 +160,8 @@ export default function Login() {
           Centralized management for missing-person investigations,
           forensic DNA samples, and identification records.
         </p>
+        {/* Boro ghurte thaka DNA helix — login page er decoration (UI upgrade) */}
+        <DnaHelix rungs={10} size="large" />
       </section>
 
       <section className="login-form-wrap">
```

## UI Phase 1b testing

| Test | Result |
|---|---|
| `npm run build` | ✅ |
| Screenshots (login, admin dashboard, DNA samples) | ✅ Neutral dark UI, teal only on active link / primary button / links / icons. Soft badges. Faint helix on login |

---

# UI Phase 2 — DNA Analytics Page Onto the Theme (branch `ui/m1-ui-upgrade`)

## Goal

Two pages were left out of the theme in UI Phase 1. This phase fixes the one that is actually used.

## What was found

| Page | Finding | Action |
|---|---|---|
| `DnaAnalyticsDashboard.jsx` | ~75 inline light styles (white / pastel boxes, blue tabs). On the dark theme the table header and top bar were light-on-light (unreadable) | **Converted** to the app's components + Bootstrap classes |
| `/dna-analytics` route | Declared **twice** in `AppRoutes.jsx`: line 74 at the top level (no `ProtectedRoute`, no `AppLayout`) and inside the protected layout (`Admin` / `Lab Technician`). The top-level one won, so the page had **no sidebar** and the page itself opened **without login** | **Removed** the top-level duplicate |
| `PoliceStations.jsx` | Tailwind classes, but **no route imports this file**. The sidebar's "Police Stations" (`/admin/police-stations`) renders `AdminList kind="stations"` from `Administration.jsx`, which is Bootstrap and already themed. The file is also broken (expects `response.success`, but the service returns an array) | **Not touched.** It's dead code. Deleting it is for the team to decide (looks like part of the "remove duplicate/mock admin pages" work) |

## Files changed

| File | What changed |
|---|---|
| `frontend/src/pages/DnaAnalyticsDashboard.jsx` | Render part rewritten with `PageHeader`, `MetricCard`, `nav-tabs`, `card`, `table`, soft badges. **Data fetching (API calls, filter, state) unchanged** |
| `frontend/src/routes/AppRoutes.jsx` | Removed the unprotected top-level `/dna-analytics` route (a Banglish comment marks the spot) |
| `frontend/src/index.css` | `.status-badge.text-bg-danger` (soft red, for "0 Technicians"), `.nav-tabs` colours + smaller tab text so the 3 query tabs fit in one line (already inside the full file above) |

## Old → new (DnaAnalyticsDashboard)

| Old (inline style) | New (shared class / component) |
|---|---|
| `<h2>` + `<p>` with inline colours | `<PageHeader title subtitle />` |
| Red error `div` | `alert alert-danger` |
| 3 pastel stat boxes (blue / green / purple) | 3 × `<MetricCard />` in `row g-3` |
| 3 hand-styled tab buttons (blue underline) | `TABS` array → `nav nav-tabs` with `nav-link active` |
| Bordered `div` + light header bar | `card` + `card-header` |
| Plain `<table>` with light `thead` | `table table-hover` inside `table-responsive` |
| Inline select | `form-select w-auto` + `<label htmlFor>` |
| Pastel badge spans | `badge status-badge text-bg-primary / success / danger` (soft badges from Phase 1b) |

## `frontend/src/pages/DnaAnalyticsDashboard.jsx` (modified)

```diff
diff --git a/frontend/src/pages/DnaAnalyticsDashboard.jsx b/frontend/src/pages/DnaAnalyticsDashboard.jsx
index d656fd9..4ec928f 100644
--- a/frontend/src/pages/DnaAnalyticsDashboard.jsx
+++ b/frontend/src/pages/DnaAnalyticsDashboard.jsx
@@ -1,4 +1,12 @@
 import React, { useState, useEffect } from 'react';
+import { MetricCard, PageHeader } from '../components/Ui'; // app er baki page er moto same component (UI Phase 2)
+
+// Tab gula ekhane list kora — niche map kore button banano hoy (UI Phase 2)
+const TABS = [
+    ['overview', 'Query 1: Multitable Staff Overview (JOIN)'],
+    ['capacity', 'Query 2: Lab Staffing Capacity (GROUP BY & HAVING)'],
+    ['subquery', 'Query 3: Above Average Labs (Subquery)'],
+];
 
 const OVERVIEW_API = 'http://localhost:8000/api/analytics/dna/technician-overview';
 const CAPACITY_API = 'http://localhost:8000/api/analytics/dna/lab-capacity';
@@ -54,144 +62,104 @@ export default function DnaAnalyticsDashboard() {
         }
     };
 
+    // Inline style er bodole Bootstrap class + app er component — tai dark theme automatic lage (UI Phase 2)
     return (
-        <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
-            <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>DNA Analytics & Staffing Intelligence</h2>
-            <p style={{ color: '#64748b', marginBottom: '20px', fontSize: '14px' }}>
-                CP2 Raw SQL Query Demonstrations: Multitable JOIN, GROUP BY / HAVING, and Nested Subqueries.
-            </p>
+        <>
+            <PageHeader
+                title="DNA Analytics & Staffing Intelligence"
+                subtitle="CP2 Raw SQL Query Demonstrations: Multitable JOIN, GROUP BY / HAVING, and Nested Subqueries."
+            />
 
-            {error && (
-                <div style={{ background: '#fee2e2', color: '#991b1b', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>
-                    {error}
-                </div>
-            )}
+            {error && <div className="alert alert-danger">{error}</div>}
 
             {/* Summary Stat Cards */}
-            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
-                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '16px' }}>
-                    <div style={{ fontSize: '13px', color: '#1e40af', fontWeight: '600' }}>TOTAL REGISTERED STAFF</div>
-                    <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#1e3a8a', marginTop: '4px' }}>{overviewData.length}</div>
-                    <div style={{ fontSize: '12px', color: '#3b82f6', marginTop: '4px' }}>Multitable JOIN Coverage</div>
+            <div className="row g-3 mb-4">
+                <div className="col-md-4">
+                    <MetricCard label="Total Registered Staff" value={overviewData.length} hint="Multitable JOIN Coverage" />
                 </div>
-                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '16px' }}>
-                    <div style={{ fontSize: '13px', color: '#166534', fontWeight: '600' }}>TOTAL DNA LABS</div>
-                    <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#14532d', marginTop: '4px' }}>{capacityData.length}</div>
-                    <div style={{ fontSize: '12px', color: '#22c55e', marginTop: '4px' }}>Aggregated Laboratories</div>
+                <div className="col-md-4">
+                    <MetricCard label="Total DNA Labs" value={capacityData.length} hint="Aggregated Laboratories" tone="success" />
                 </div>
-                <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '8px', padding: '16px' }}>
-                    <div style={{ fontSize: '13px', color: '#6b21a8', fontWeight: '600' }}>ABOVE-AVG CAPACITY LABS</div>
-                    <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#581c87', marginTop: '4px' }}>{aboveAvgData.length}</div>
-                    <div style={{ fontSize: '12px', color: '#a855f7', marginTop: '4px' }}>Subquery Filtered Results</div>
+                <div className="col-md-4">
+                    <MetricCard label="Above-Avg Capacity Labs" value={aboveAvgData.length} hint="Subquery Filtered Results" />
                 </div>
             </div>
 
             {/* Navigation Tabs */}
-            <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid #e2e8f0', marginBottom: '20px' }}>
-                <button
-                    onClick={() => setActiveTab('overview')}
-                    style={{
-                        padding: '10px 16px',
-                        border: 'none',
-                        background: 'none',
-                        fontWeight: '600',
-                        fontSize: '14px',
-                        cursor: 'pointer',
-                        borderBottom: activeTab === 'overview' ? '3px solid #2563eb' : '3px solid transparent',
-                        color: activeTab === 'overview' ? '#2563eb' : '#64748b'
-                    }}
-                >
-                    Query 1: Multitable Staff Overview (JOIN)
-                </button>
-                <button
-                    onClick={() => setActiveTab('capacity')}
-                    style={{
-                        padding: '10px 16px',
-                        border: 'none',
-                        background: 'none',
-                        fontWeight: '600',
-                        fontSize: '14px',
-                        cursor: 'pointer',
-                        borderBottom: activeTab === 'capacity' ? '3px solid #2563eb' : '3px solid transparent',
-                        color: activeTab === 'capacity' ? '#2563eb' : '#64748b'
-                    }}
-                >
-                    Query 2: Lab Staffing Capacity (GROUP BY & HAVING)
-                </button>
-                <button
-                    onClick={() => setActiveTab('subquery')}
-                    style={{
-                        padding: '10px 16px',
-                        border: 'none',
-                        background: 'none',
-                        fontWeight: '600',
-                        fontSize: '14px',
-                        cursor: 'pointer',
-                        borderBottom: activeTab === 'subquery' ? '3px solid #2563eb' : '3px solid transparent',
-                        color: activeTab === 'subquery' ? '#2563eb' : '#64748b'
-                    }}
-                >
-                    Query 3: Above Average Labs (Subquery)
-                </button>
-            </div>
+            <ul className="nav nav-tabs mb-3">
+                {TABS.map(([key, label]) => (
+                    <li className="nav-item" key={key}>
+                        <button
+                            type="button"
+                            className={`nav-link ${activeTab === key ? 'active' : ''}`}
+                            onClick={() => setActiveTab(key)}
+                        >
+                            {label}
+                        </button>
+                    </li>
+                ))}
+            </ul>
 
             {loading ? (
-                <p>Loading analytics data...</p>
+                <p className="text-secondary">Loading analytics data...</p>
             ) : (
                 <>
                     {/* TAB 1: Multitable JOIN */}
                     {activeTab === 'overview' && (
-                        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
-                            <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: '600', fontSize: '14px' }}>
-                                Relational Mapping: `dna_labs` ⨝ `lab_technicians` ⟕ `users`
+                        <div className="card">
+                            <div className="card-header">
+                                <strong>Relational Mapping: `dna_labs` ⨝ `lab_technicians` ⟕ `users`</strong>
                             </div>
-                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
-                                <thead style={{ background: '#f1f5f9' }}>
-                                    <tr>
-                                        <th style={{ padding: '12px' }}>Staff Name</th>
-                                        <th style={{ padding: '12px' }}>Designation</th>
-                                        <th style={{ padding: '12px' }}>Assigned DNA Lab</th>
-                                        <th style={{ padding: '12px' }}>Lab City</th>
-                                        <th style={{ padding: '12px' }}>Contact</th>
-                                        <th style={{ padding: '12px' }}>System Account</th>
-                                    </tr>
-                                </thead>
-                                <tbody>
-                                    {overviewData.map((row) => (
-                                        <tr key={row.technician_id} style={{ borderTop: '1px solid #e2e8f0' }}>
-                                            <td style={{ padding: '12px', fontWeight: '500' }}>{row.technician_name}</td>
-                                            <td style={{ padding: '12px' }}>{row.designation}</td>
-                                            <td style={{ padding: '12px' }}>{row.lab_name}</td>
-                                            <td style={{ padding: '12px' }}>{row.lab_city}</td>
-                                            <td style={{ padding: '12px', fontSize: '13px', color: '#475569' }}>
-                                                <div>{row.technician_email}</div>
-                                                <div>{row.technician_phone}</div>
-                                            </td>
-                                            <td style={{ padding: '12px' }}>
-                                                {row.username ? (
-                                                    <span style={{ background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>
-                                                        @{row.username} ({row.account_status})
-                                                    </span>
-                                                ) : (
-                                                    <span style={{ color: '#94a3b8', fontSize: '12px' }}>Unlinked</span>
-                                                )}
-                                            </td>
+                            <div className="table-responsive">
+                                <table className="table table-hover mb-0">
+                                    <thead>
+                                        <tr>
+                                            <th>Staff Name</th>
+                                            <th>Designation</th>
+                                            <th>Assigned DNA Lab</th>
+                                            <th>Lab City</th>
+                                            <th>Contact</th>
+                                            <th>System Account</th>
                                         </tr>
-                                    ))}
-                                </tbody>
-                            </table>
+                                    </thead>
+                                    <tbody>
+                                        {overviewData.map((row) => (
+                                            <tr key={row.technician_id}>
+                                                <td className="fw-semibold">{row.technician_name}</td>
+                                                <td>{row.designation}</td>
+                                                <td>{row.lab_name}</td>
+                                                <td>{row.lab_city}</td>
+                                                <td className="small text-secondary">
+                                                    <div>{row.technician_email}</div>
+                                                    <div>{row.technician_phone}</div>
+                                                </td>
+                                                <td>
+                                                    {row.username ? (
+                                                        <span className="badge text-bg-primary status-badge">
+                                                            @{row.username} ({row.account_status})
+                                                        </span>
+                                                    ) : (
+                                                        <span className="small text-secondary">Unlinked</span>
+                                                    )}
+                                                </td>
+                                            </tr>
+                                        ))}
+                                    </tbody>
+                                </table>
+                            </div>
                         </div>
                     )}
 
                     {/* TAB 2: GROUP BY & HAVING */}
                     {activeTab === 'capacity' && (
-                        <div>
-                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
-                                <label style={{ fontSize: '14px', fontWeight: '500' }}>Filter by Min Technicians (HAVING clause):</label>
+                        <>
+                            <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
+                                <label className="form-label mb-0" htmlFor="minTechFilter">Filter by Min Technicians (HAVING clause):</label>
                                 <select
+                                    id="minTechFilter"
+                                    className="form-select w-auto"
                                     value={minTechFilter}
                                     onChange={(e) => handleCapacityFilter(e.target.value)}
-                                    style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                                 >
                                     <option value="0">All Labs (HAVING &ge; 0)</option>
                                     <option value="1">At least 1 Technician (HAVING &ge; 1)</option>
@@ -199,34 +167,68 @@ export default function DnaAnalyticsDashboard() {
                                 </select>
                             </div>
 
-                            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
-                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
-                                    <thead style={{ background: '#f1f5f9' }}>
+                            <div className="card">
+                                <div className="table-responsive">
+                                    <table className="table table-hover mb-0">
+                                        <thead>
+                                            <tr>
+                                                <th>Lab ID</th>
+                                                <th>Laboratory Name</th>
+                                                <th>Location / City</th>
+                                                <th>Contact Hotline</th>
+                                                <th>Total Assigned Staff</th>
+                                            </tr>
+                                        </thead>
+                                        <tbody>
+                                            {capacityData.map((lab) => (
+                                                <tr key={lab.lab_id}>
+                                                    <td className="fw-semibold">#{lab.lab_id}</td>
+                                                    <td>{lab.lab_name}</td>
+                                                    <td>{lab.city}</td>
+                                                    <td>{lab.contact_number}</td>
+                                                    <td>
+                                                        {/* Technician thakle shobuj, na thakle lal badge */}
+                                                        <span className={`badge status-badge ${lab.total_technicians > 0 ? 'text-bg-success' : 'text-bg-danger'}`}>
+                                                            {lab.total_technicians} Technicians
+                                                        </span>
+                                                    </td>
+                                                </tr>
+                                            ))}
+                                        </tbody>
+                                    </table>
+                                </div>
+                            </div>
+                        </>
+                    )}
+
+                    {/* TAB 3: Nested Subquery */}
+                    {activeTab === 'subquery' && (
+                        <div className="card">
+                            <div className="card-header small text-secondary">
+                                Displaying labs where staff count is greater than or equal to the calculated subquery system average.
+                            </div>
+                            <div className="table-responsive">
+                                <table className="table table-hover mb-0">
+                                    <thead>
                                         <tr>
-                                            <th style={{ padding: '12px' }}>Lab ID</th>
-                                            <th style={{ padding: '12px' }}>Laboratory Name</th>
-                                            <th style={{ padding: '12px' }}>Location / City</th>
-                                            <th style={{ padding: '12px' }}>Contact Hotline</th>
-                                            <th style={{ padding: '12px' }}>Total Assigned Staff</th>
+                                            <th>Lab ID</th>
+                                            <th>Laboratory Name</th>
+                                            <th>City</th>
+                                            <th>Technician Count</th>
+                                            <th>Calculated System Average</th>
+                                            <th>Status</th>
                                         </tr>
                                     </thead>
                                     <tbody>
-                                        {capacityData.map((lab) => (
-                                            <tr key={lab.lab_id} style={{ borderTop: '1px solid #e2e8f0' }}>
-                                                <td style={{ padding: '12px', fontWeight: 'bold' }}>#{lab.lab_id}</td>
-                                                <td style={{ padding: '12px', fontWeight: '500' }}>{lab.lab_name}</td>
-                                                <td style={{ padding: '12px' }}>{lab.city}</td>
-                                                <td style={{ padding: '12px' }}>{lab.contact_number}</td>
-                                                <td style={{ padding: '12px' }}>
-                                                    <span style={{
-                                                        background: lab.total_technicians > 0 ? '#dcfce7' : '#fee2e2',
-                                                        color: lab.total_technicians > 0 ? '#166534' : '#991b1b',
-                                                        padding: '3px 10px',
-                                                        borderRadius: '12px',
-                                                        fontWeight: '600'
-                                                    }}>
-                                                        {lab.total_technicians} Technicians
-                                                    </span>
+                                        {aboveAvgData.map((lab) => (
+                                            <tr key={lab.lab_id}>
+                                                <td className="fw-semibold">#{lab.lab_id}</td>
+                                                <td>{lab.lab_name}</td>
+                                                <td>{lab.city}</td>
+                                                <td className="fw-semibold text-success">{lab.technician_count} Staff</td>
+                                                <td className="text-secondary">{lab.system_avg_technicians} Staff / Lab</td>
+                                                <td>
+                                                    <span className="badge text-bg-primary status-badge">&ge; Average</span>
                                                 </td>
                                             </tr>
                                         ))}
@@ -235,45 +237,8 @@ export default function DnaAnalyticsDashboard() {
                             </div>
                         </div>
                     )}
-
-                    {/* TAB 3: Nested Subquery */}
-                    {activeTab === 'subquery' && (
-                        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
-                            <div style={{ padding: '12px 16px', background: '#faf5ff', borderBottom: '1px solid #e2e8f0', fontSize: '14px', color: '#581c87' }}>
-                                Displaying labs where staff count is greater than or equal to the calculated subquery system average.
-                            </div>
-                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
-                                <thead style={{ background: '#f1f5f9' }}>
-                                    <tr>
-                                        <th style={{ padding: '12px' }}>Lab ID</th>
-                                        <th style={{ padding: '12px' }}>Laboratory Name</th>
-                                        <th style={{ padding: '12px' }}>City</th>
-                                        <th style={{ padding: '12px' }}>Technician Count</th>
-                                        <th style={{ padding: '12px' }}>Calculated System Average</th>
-                                        <th style={{ padding: '12px' }}>Status</th>
-                                    </tr>
-                                </thead>
-                                <tbody>
-                                    {aboveAvgData.map((lab) => (
-                                        <tr key={lab.lab_id} style={{ borderTop: '1px solid #e2e8f0' }}>
-                                            <td style={{ padding: '12px', fontWeight: 'bold' }}>#{lab.lab_id}</td>
-                                            <td style={{ padding: '12px', fontWeight: '500' }}>{lab.lab_name}</td>
-                                            <td style={{ padding: '12px' }}>{lab.city}</td>
-                                            <td style={{ padding: '12px', fontWeight: 'bold', color: '#16a34a' }}>{lab.technician_count} Staff</td>
-                                            <td style={{ padding: '12px', color: '#64748b' }}>{lab.system_avg_technicians} Staff / Lab</td>
-                                            <td style={{ padding: '12px' }}>
-                                                <span style={{ background: '#f3e8ff', color: '#6b21a8', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '500' }}>
-                                                    &ge; Average
-                                                </span>
-                                            </td>
-                                        </tr>
-                                    ))}
-                                </tbody>
-                            </table>
-                        </div>
-                    )}
                 </>
             )}
-        </div>
+        </>
     );
 }
\ No newline at end of file
```

## `frontend/src/routes/AppRoutes.jsx` (modified)

```diff
diff --git a/frontend/src/routes/AppRoutes.jsx b/frontend/src/routes/AppRoutes.jsx
index 7d9428e..8e556e8 100644
--- a/frontend/src/routes/AppRoutes.jsx
+++ b/frontend/src/routes/AppRoutes.jsx
@@ -71,7 +71,8 @@ export default function AppRoutes() {
 
       <Route path="/dna-labs" element={<DnaLabsPage />} />
       <Route path="/lab-technicians" element={<LabTechniciansPage />} />
-      <Route path="/dna-analytics" element={<DnaAnalyticsDashboard />} />
+      {/* /dna-analytics ekhane chilo (login chara, sidebar chara) — shoriye deya hoyeche.
+          Ekhon shudhu niche protected route ta kaj kore (Admin / Lab Technician, sidebar shoho). UI Phase 2 */}
 
       <Route
         path="/unauthorized"
```

## Access after this phase

| Who | `/dna-analytics` before | After |
|---|---|---|
| Not logged in | Page opened (top-level route) | Redirected to login (`ProtectedRoute`) |
| Officer | Page opened | `/unauthorized` (allowed roles: Admin, Lab Technician) |
| Admin / Lab Technician | Page opened, no sidebar | Page opens **inside the app layout** |

## UI Phase 2 testing

| Test | Result |
|---|---|
| `npm run build` | ✅ |
| `oxlint` on changed files | ✅ Only an old warning: unused `err` in the analytics `catch` (data code, not touched) |
| DNA Analytics screenshot (Admin, fake API data) | ✅ Sidebar + topbar present, "DNA Analytics" active, 3 metric cards, 3 tabs on one line, readable table, soft "@user (active)" badge |
| Tab 2 (click "Query 2") | ✅ Filter select themed. "2 Technicians" soft green, "0 Technicians" soft red |
| `/admin/police-stations` screenshot | ✅ The real stations page (`AdminList`) is already themed |

## Known gaps after UI Phase 2

| Item | Note |
|---|---|
| `PoliceStations.jsx` | Unused + broken file (see above). Team decision whether to delete it |
| `/dna-labs`, `/lab-technicians` | Also declared at the top level of `AppRoutes.jsx` without `ProtectedRoute`. The sidebar uses `/admin/labs` and `/admin/technicians`, so these look like leftovers. Not changed (other members' area); flag to the team |
| Back-to-top position | Bottom-right. Check again when the chatbot widget is merged |

---

# UI Phase 3 — Chatbot Widget + Leftover Pages Onto the Theme

## Goal

The chatbot widget (`ChatWidget`) came in with its own **light** theme (white panel, navy header `#102a43`, old teal `#1f7a8c`), so it looked like a different app on top of the black + teal UI. This phase puts it on the same theme and fixes the other places the UI upgrade had missed.

## What was found

| Place | Finding | Action |
|---|---|---|
| `ChatWidget.css` | Hard-coded light colours: white panel/bubbles, navy header, `#f4f7fa` message area, old teal `#1f7a8c` | **Converted** to the `--ft-*` variables from `index.css` |
| Back-to-top button | Same corner as the chat "Help" launcher (bottom-right). Launcher has higher z-index, so it **covered** back-to-top (the known gap noted after UI Phase 2) | Moved back-to-top **above** the launcher |
| `FamilyMembersManager.jsx` | Solid `bg-primary` / `bg-info` card headers (bright cyan with dark text), `btn-success` / `btn-info` / `btn-secondary`, `badge bg-secondary` | Same pattern as other forms: `card-header bg-white` + `<strong>`, `btn-primary` / `btn-light`, soft `status-badge` |
| `DnaLabsPage.jsx`, `LabTechniciansPage.jsx` | Extra `container-fluid py-4` wrapper (double padding inside `.content-wrap`), `border-0` cards (no border, unlike every other card), `thead.table-light`, `text-dark` / `text-muted`, `bg-light` / `-subtle` badges, `btn-outline-info` | Same structure as `Cases.jsx`: fragment + `PageHeader` + plain `card`, `card-header` for the form title, soft `status-badge`s |
| `FamilyMembersPage.jsx` | Extra `container-fluid py-3` wrapper | Replaced with a fragment |
| Every `<select>` dropdown list, date picker | The browser drew the open option list in **light mode** (white background) while options took the theme's light text → white on white, unreadable (e.g. DNA Matches sample select). Date picker icon was dark on dark | `color-scheme: dark` on `:root` + dark `option` / `optgroup` colours in `index.css` (one global fix, every page) |
| Browser autofill (login) | Autofilled inputs get the browser's pale background | Autofill kept dark with an inset shadow |
| `PoliceStations.jsx` | Still Tailwind + unused (see UI Phase 2) | **Not touched** — dead code, team decision |
| `btn-success` "Confirm Match" (`Laboratory.jsx`), `btn-outline-success` "Activate" (`Administration.jsx`) | Green, but on purpose (paired with red Reject / Deactivate) | **Kept** |

## Files changed

| File | What changed |
|---|---|
| `frontend/src/components/ChatWidget.css` | Every colour now from `--ft-*` variables; livelier header / bubbles; separate footer band; suggestion toggle, maximize and resize styles |
| `frontend/src/components/ChatWidget.jsx` | DNA helix avatar + live dot in the header, helix icon in the launcher, 💡 suggestion toggle, mouse-wheel horizontal scroll for chips, maximize button, drag-to-resize handle. **Chat logic (send, errors, sources) unchanged** |
| `frontend/src/index.css` | `.back-to-top` `bottom: 1.5rem` → `5.25rem`; `color-scheme: dark` on `:root`; dark `option, optgroup`; dark autofill |
| `frontend/src/components/FamilyMembersManager.jsx` | Form card headers, buttons, relationship badge, "Register DNA" button |
| `frontend/src/pages/DnaLabsPage.jsx` | Wrapper, cards, form header, table head, badges, text colours |
| `frontend/src/pages/LabTechniciansPage.jsx` | Same as DnaLabsPage + designation / "Linked" badges, "+ Link User" button |
| `frontend/src/pages/FamilyMembersPage.jsx` | Wrapper → fragment |

## Chat widget: old → new

| Part | Old | New (same as the rest of the app) |
|---|---|---|
| Launcher | `#1f7a8c`, white text | `--ft-teal`, dark text `#04201d` (like `btn-primary`), hover `--ft-teal-light` |
| Panel | White, `#e0e8ef` border, radius 9px | `--ft-surface-solid`, `--ft-border`, radius 10px (like `.card`) |
| Header | Navy `#102a43` | Transparent (same surface as the panel) + `--ft-border` bottom line, subtitle `--ft-muted` |
| Message area | `#f4f7fa` | Transparent — same surface as the panel. (First try used `--ft-bg`, the near-black page colour; it looked like a black hole inside the panel, so dropped) |
| Assistant bubble | White | `rgba(255,255,255,0.04)` (a little lighter than the panel) + `--ft-border` |
| User bubble | Navy | `--ft-teal` with dark text |
| Error bubble | Pink `#fff4f4` | Soft red (same red as `text-bg-danger` status badge) |
| Off-topic badge / border | Pastel yellow | Soft amber (same as `text-bg-warning` status badge) |
| Source tag | Grey-blue | `--ft-teal-soft` + `--ft-teal-light` (same as `text-bg-primary` badge) |
| Chips, textarea, Clear / Send | White / old teal | Dark surface, teal focus ring (like `.form-control:focus`), Clear = `btn-light` look, Send = `btn-primary` look |
| Shadows | Navy-tinted | Plain black (no teal glow — UI Phase 1b rule) |

## Chat widget round 2 (after feedback)

Feedback: after the dark conversion the bot looked **dull**, the suggested questions and the chat space blended together, suggestions took too much space, and the window should be **maximizable / resizable**.

| Change | How |
|---|---|
| Livelier header | DNA helix avatar (`DnaHelix` from `DnaEffects.jsx`, same as the sidebar logo) + faint teal glow top-left |
| Assistant bubbles stand out | A bit lighter (`rgba(255,255,255,0.06)`) + thin teal left edge (like the sidebar's active link); typing dots teal |
| Chat space vs suggestions | Suggestions + input sit in a separate darker **footer band** (`.ft-chat-footer`) with a stronger top border; chips are teal (clearly clickable, not messages) |
| Suggestions take less space | One **horizontal scrolling row** (mouse wheel scrolls it sideways; right edge fades out so you can tell there is more). Shown / hidden with the **💡 button** next to Clear chat (`showSuggestions` state). No label bar — when hidden, the chip area disappears completely. Chips smaller. (A "SUGGESTED QUESTIONS · Hide ▾ / Show ▸" bar was tried first, then removed on request since the 💡 button does the same) |
| Maximize | Header button toggles `.ft-chat-panel-max` → `min(960px, 100vw − 44px)` × `100vh − 44px`. Icon switches between expand / shrink corners |
| Resize | Grip at the **top-left** corner (panel is anchored bottom-right, so that corner moves). `pointerdown` → track the mouse on `window` → new size = start size + how far the mouse moved left / up. Clamped to min 320 × 380, max screen − 44px. Size is passed as CSS variables (`--ft-chat-w`, `--ft-chat-h`), so the mobile media query can still force full screen |
| Mobile (≤ 480px) | Panel already full screen → grip and maximize button hidden |
| Default size | 380 → 400px wide so 2 chips + subtitle fit on one line each |

**Merged with teammate commit `aaafb90`** ("chatbot ui: fix suggestion chip layout and shorten greeting replies", pushed to `main` at the same time; conflict in `ChatWidget.jsx`):

| From `aaafb90` | Result |
|---|---|
| Suggestions auto-hide after the first question, come back on "Clear chat" | **Not kept** — Member 1's version kept; suggestions only hide with the 💡 button |
| Shorter greeting ("Hi! Ask me anything about how ForenTrace works, or try a suggestion below.") | **Not kept** — original greeting kept |
| Shorter small-talk reply in `backend/chatbot/smallTalk.js` | **Kept** (backend, no conflict) |
| 💡 toggle button next to Clear chat + `.ft-chat-suggest-toggle` CSS (old white / navy colours) | **Kept, restyled dark** — grey when suggestions are hidden, teal + lit when shown. Now the **only** suggestion toggle (the Hide / Show bar was removed) |

**Live elements + transitions** (feedback: "still looks dull"). All in `ChatWidget.css`; the `prefers-reduced-motion` rule in `index.css` switches them off for users who turn motion off:

| Element | Effect |
|---|---|
| Launcher | DNA helix icon instead of "?", soft teal pulse ring around the button |
| Panel open | Pops in from the bottom-right corner (fade + small scale) |
| Header | Pulsing live dot after the title (`.live-dot` from `index.css`); teal glow slowly drifts |
| Messages | New message fades up; user message slides in from the right |
| Suggestion chips | Slide in one after another when shown; lift on hover |
| Buttons (Send, Clear, 💡, maximize, close) | Lift on hover, press-down on click |
| 💡 turned on | Small "light up" pop + teal ripple |

Tested with the real `ChatWidget` bundled into a scratch page (headless Edge, script clicks launcher / maximize / drags the grip): default **400×560**, maximized **960×(screen − 44)**, dragged 200px left → width grew by 200 + grab offset, height stopped at the screen limit; Hide collapses the chips to the one-line label.

## Code

### `frontend/src/components/ChatWidget.jsx` (modified)

```diff
diff --git a/frontend/src/components/ChatWidget.jsx b/frontend/src/components/ChatWidget.jsx
index f404f52..32e96a1 100644
--- a/frontend/src/components/ChatWidget.jsx
+++ b/frontend/src/components/ChatWidget.jsx
@@ -1,11 +1,12 @@
 import { useEffect, useRef, useState } from 'react'
 import { askChatbot } from '../services/chatbotService'
+import { DnaHelix } from './DnaEffects' // sidebar logo er same DNA icon, header e
 import './ChatWidget.css'
 
 const INITIAL_GREETING = {
   id: 'greeting',
   role: 'assistant',
-  text: "Hi! Ask me anything about how ForenTrace works, or try a suggestion below.",
+  text: "Hello! I'm the ForenTrace Assistant. I can answer questions about ForenTrace, cases, DNA samples, DNA matching, laboratories, and accounts. Ask me anything about using the system.",
   isGreeting: true,
 }
 
@@ -36,9 +37,52 @@ export default function ChatWidget() {
   const [messages, setMessages] = useState([INITIAL_GREETING])
   const [input, setInput] = useState('')
   const [isLoading, setIsLoading] = useState(false)
-  const [showSuggestions, setShowSuggestions] = useState(true)
+  const [showSuggestions, setShowSuggestions] = useState(true) // suggested question gula lukano / dekhano
+  const [isMaximized, setIsMaximized] = useState(false) // boro kore dekhano (prai pura screen)
+  const [size, setSize] = useState(null) // user drag kore je size dilo { w, h } — null hole default 380x560
+  const [isResizing, setIsResizing] = useState(false)
   const listRef = useRef(null)
   const textareaRef = useRef(null)
+  const panelRef = useRef(null)
+  const chipsRef = useRef(null)
+
+  // Mouse er chaka (upor-niche) ghurale suggestion chip gula pashe scroll hoy.
+  // passive: false lage, noile preventDefault kaj kore na (pichoner page scroll hoye jeto).
+  useEffect(() => {
+    const row = chipsRef.current
+    if (!row) return
+    const onWheel = (e) => {
+      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
+      e.preventDefault()
+      row.scrollLeft += e.deltaY
+    }
+    row.addEventListener('wheel', onWheel, { passive: false })
+    return () => row.removeEventListener('wheel', onWheel)
+  }, [isOpen, showSuggestions])
+
+  // Panel niche-dane atkano, tai upor-bam kona tene boro/choto kora hoy.
+  // Mouse jotota bame/upore jay, width/height totota bare.
+  const startResize = (e) => {
+    e.preventDefault()
+    const rect = panelRef.current.getBoundingClientRect()
+    const startX = e.clientX
+    const startY = e.clientY
+    setIsMaximized(false)
+    setIsResizing(true)
+
+    const onMove = (ev) => {
+      const w = Math.min(Math.max(rect.width + (startX - ev.clientX), 320), window.innerWidth - 44)
+      const h = Math.min(Math.max(rect.height + (startY - ev.clientY), 380), window.innerHeight - 44)
+      setSize({ w, h })
+    }
+    const onUp = () => {
+      window.removeEventListener('pointermove', onMove)
+      window.removeEventListener('pointerup', onUp)
+      setIsResizing(false)
+    }
+    window.addEventListener('pointermove', onMove)
+    window.addEventListener('pointerup', onUp)
+  }
 
   // Auto-scroll to newest message
   useEffect(() => {
@@ -57,7 +101,6 @@ export default function ChatWidget() {
   const clearChat = () => {
     setMessages([INITIAL_GREETING])
     setInput('')
-    setShowSuggestions(true)
   }
 
   const sendQuestion = async (rawQuestion) => {
@@ -80,7 +123,6 @@ export default function ChatWidget() {
     const userMsg = { id: `user-${Date.now()}`, role: 'user', text: trimmed }
     setMessages((prev) => [...prev, userMsg])
     setInput('')
-    setShowSuggestions(false)
     setIsLoading(true)
 
     try {
@@ -152,21 +194,48 @@ export default function ChatWidget() {
           aria-label="Open ForenTrace Assistant"
           onClick={() => setIsOpen(true)}
         >
-          <span className="ft-chat-launcher-icon" aria-hidden="true">?</span>
+          <span className="ft-chat-launcher-icon" aria-hidden="true"><DnaHelix rungs={3} /></span>
           <span className="ft-chat-launcher-text">Help</span>
         </button>
       )}
 
       {isOpen && (
-        <div className="ft-chat-panel" role="dialog" aria-label="ForenTrace Assistant chat">
+        <div
+          ref={panelRef}
+          className={`ft-chat-panel${isMaximized ? ' ft-chat-panel-max' : ''}${isResizing ? ' ft-chat-panel-resizing' : ''}`}
+          // CSS variable diye size — tai mobile er media query (full screen) eta ke override korte pare
+          style={size ? { '--ft-chat-w': `${size.w}px`, '--ft-chat-h': `${size.h}px` } : undefined}
+          role="dialog"
+          aria-label="ForenTrace Assistant chat"
+        >
+          <div
+            className="ft-chat-resize"
+            onPointerDown={startResize}
+            title="Drag to resize"
+            aria-hidden="true"
+          />
           <div className="ft-chat-header">
+            <span className="ft-chat-avatar"><DnaHelix rungs={4} /></span>
             <div className="ft-chat-header-text">
-              <h2 className="ft-chat-title">ForenTrace Assistant</h2>
-              <p className="ft-chat-subtitle">Ask questions about the ForenTrace system.</p>
+              <h2 className="ft-chat-title">ForenTrace Assistant <span className="live-dot" aria-hidden="true" /></h2>
+              <p className="ft-chat-subtitle">Ask about using ForenTrace.</p>
             </div>
             <button
               type="button"
-              className="ft-chat-close"
+              className="ft-chat-icon-btn ft-chat-max"
+              aria-label={isMaximized ? 'Restore chat size' : 'Maximize chat'}
+              title={isMaximized ? 'Restore' : 'Maximize'}
+              onClick={() => setIsMaximized((v) => !v)}
+            >
+              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
+                {isMaximized
+                  ? <path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6" />
+                  : <path d="M9 3H3v6M15 3h6v6M9 21H3v-6M15 21h6v-6" />}
+              </svg>
+            </button>
+            <button
+              type="button"
+              className="ft-chat-icon-btn"
               aria-label="Close chat"
               title="Close chat"
               onClick={() => setIsOpen(false)}
@@ -211,8 +280,10 @@ export default function ChatWidget() {
             )}
           </div>
 
+          <div className="ft-chat-footer">
+          {/* Suggested question — shudhu 💡 button on thakle dekhay */}
           {showSuggestions && (
-            <div className="ft-chat-suggestions" aria-label="Suggested questions">
+            <div id="ft-chat-chip-list" ref={chipsRef} className="ft-chat-suggestions" aria-label="Suggested questions">
               {SUGGESTIONS.map((s) => (
                 <button
                   key={s}
@@ -249,11 +320,13 @@ export default function ChatWidget() {
                 {charCount}/{MAX_LEN}
               </span>
               <div className="ft-chat-actions">
+                {/* 💡 — suggested question dekhano / lukano */}
                 <button
                   type="button"
                   className={`ft-chat-suggest-toggle${showSuggestions ? ' is-active' : ''}`}
                   onClick={() => setShowSuggestions((v) => !v)}
                   aria-pressed={showSuggestions}
+                  aria-controls="ft-chat-chip-list"
                   aria-label={showSuggestions ? 'Hide suggested questions' : 'Show suggested questions'}
                   title="Suggested questions"
                 >
@@ -273,6 +346,7 @@ export default function ChatWidget() {
               </div>
             </div>
           </form>
+          </div>
         </div>
       )}
     </div>
```

### `frontend/src/components/ChatWidget.css` (modified)

```diff
diff --git a/frontend/src/components/ChatWidget.css b/frontend/src/components/ChatWidget.css
index 4d6a495..aa9e103 100644
--- a/frontend/src/components/ChatWidget.css
+++ b/frontend/src/components/ChatWidget.css
@@ -1,4 +1,4 @@
-/* ForenTrace ChatWidget - follows index.css conventions: DM Sans, navy #102a43, teal #1f7a8c, bg #f4f7fa, card 9px */
+/* ForenTrace ChatWidget — index.css er --ft-* variable use kore, tai baki app er moto kalo + teal dekhay */
 .ft-chat-widget {
   font-family: 'DM Sans', Arial, sans-serif;
 }
@@ -14,30 +14,30 @@
   gap: 0.45rem;
   padding: 0.75rem 1rem;
   border-radius: 999px;
-  border: 1px solid #1f7a8c;
-  background: #1f7a8c;
-  color: #fff;
+  border: 1px solid var(--ft-teal);
+  background: var(--ft-teal);
+  color: #04201d;
   font-weight: 600;
   font-size: 0.92rem;
-  box-shadow: 0 8px 24px rgba(16, 42, 67, 0.22), 0 2px 8px rgba(16, 42, 67, 0.14);
+  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
   cursor: pointer;
   transition: background 0.2s, transform 0.15s, box-shadow 0.2s;
 }
 .ft-chat-launcher:hover {
-  background: #175a69;
+  background: var(--ft-teal-light);
+  border-color: var(--ft-teal-light);
   transform: translateY(-1px);
-  box-shadow: 0 12px 28px rgba(16, 42, 67, 0.28);
 }
 .ft-chat-launcher:focus-visible {
-  outline: 2px solid #102a43;
+  outline: 2px solid var(--ft-teal-light);
   outline-offset: 2px;
 }
 .ft-chat-launcher-icon {
   width: 26px;
   height: 26px;
   border-radius: 50%;
-  background: #fff;
-  color: #1f7a8c;
+  background: #04201d;
+  color: var(--ft-teal-light);
   display: inline-grid;
   place-items: center;
   font-weight: 700;
@@ -53,30 +53,85 @@
   right: 22px;
   bottom: 22px;
   z-index: 1080;
-  width: 380px;
-  height: 560px;
+  /* Size CSS variable theke — user drag korle JSX eta bodlay */
+  width: var(--ft-chat-w, 400px);
+  height: var(--ft-chat-h, 560px);
+  max-width: calc(100vw - 44px);
   max-height: calc(100vh - 44px);
+  transition: width 0.2s ease, height 0.2s ease;
   display: flex;
   flex-direction: column;
-  background: #fff;
-  border: 1px solid #e0e8ef;
-  border-radius: 9px;
-  box-shadow: 0 16px 40px rgba(16, 42, 67, 0.18), 0 4px 12px rgba(16, 42, 67, 0.1);
+  background: var(--ft-surface-solid);
+  border: 1px solid var(--ft-border);
+  border-radius: 10px;
+  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55);
   overflow: hidden;
 }
 
+/* Maximize — prai pura screen (charpashe 22px faka) */
+.ft-chat-panel.ft-chat-panel-max {
+  width: min(960px, calc(100vw - 44px));
+  height: calc(100vh - 44px);
+}
+/* Drag er shomoy animation bondho + lekha select hobe na */
+.ft-chat-panel.ft-chat-panel-resizing {
+  transition: none;
+  user-select: none;
+}
+
+/* Upor-bam konar resize handle — duita choto teal dag */
+.ft-chat-resize {
+  position: absolute;
+  top: 0;
+  left: 0;
+  z-index: 2;
+  width: 16px;
+  height: 16px;
+  cursor: nwse-resize;
+  touch-action: none;
+}
+.ft-chat-resize::before {
+  content: '';
+  position: absolute;
+  top: 4px;
+  left: 4px;
+  width: 8px;
+  height: 8px;
+  border-top: 2px solid var(--ft-border-hover);
+  border-left: 2px solid var(--ft-border-hover);
+  border-top-left-radius: 3px;
+  transition: border-color 0.2s;
+}
+.ft-chat-resize:hover::before,
+.ft-chat-panel-resizing .ft-chat-resize::before {
+  border-color: var(--ft-teal-light);
+}
+
 /* Header */
 .ft-chat-header {
   display: flex;
-  align-items: flex-start;
+  align-items: center;
   justify-content: space-between;
   gap: 0.75rem;
   padding: 0.95rem 1rem 0.85rem;
-  background: #102a43;
-  color: #d9e2ec;
-  border-bottom: 1px solid #243b53;
+  /* Upore halka teal alo — page background er moto, tai "zinda" lage */
+  background: radial-gradient(ellipse at 0% 0%, rgba(20, 184, 166, 0.16), transparent 70%);
+  color: var(--ft-text);
+  border-bottom: 1px solid var(--ft-border);
+}
+.ft-chat-avatar {
+  flex: 0 0 36px;
+  width: 36px;
+  height: 36px;
+  border-radius: 9px;
+  background: var(--ft-teal-soft);
+  border: 1px solid rgba(45, 212, 191, 0.25);
+  display: inline-grid;
+  place-items: center;
+  overflow: hidden;
 }
 .ft-chat-header-text {
+  flex: 1;
   min-width: 0;
 }
 .ft-chat-title {
@@ -89,29 +144,33 @@
 .ft-chat-subtitle {
   margin: 0.2rem 0 0;
   font-size: 0.78rem;
-  color: #9fb3c8;
+  color: var(--ft-muted);
   line-height: 1.3;
 }
-.ft-chat-close {
+.ft-chat-icon-btn {
   flex: 0 0 auto;
   width: 32px;
   height: 32px;
   border-radius: 6px;
   border: 1px solid transparent;
-  background: #243b53;
-  color: #d9e2ec;
+  background: var(--ft-surface-hover);
+  color: var(--ft-text);
   font-size: 1.35rem;
   line-height: 1;
   cursor: pointer;
   display: inline-grid;
   place-items: center;
+  transition: background 0.2s, color 0.2s;
+}
+.ft-chat-max {
+  margin-right: -0.4rem; /* close button er pashe kache thakuk */
 }
-.ft-chat-close:hover {
-  background: #334e68;
+.ft-chat-icon-btn:hover {
+  background: var(--ft-border-hover);
   color: #fff;
 }
-.ft-chat-close:focus-visible {
-  outline: 2px solid #fff;
+.ft-chat-icon-btn:focus-visible {
+  outline: 2px solid var(--ft-teal-light);
   outline-offset: 2px;
 }
 
@@ -120,7 +179,7 @@
   flex: 1;
   overflow-y: auto;
   padding: 0.9rem 0.9rem 0.6rem;
-  background: #f4f7fa;
+  background: transparent;
   display: flex;
   flex-direction: column;
   gap: 0.7rem;
@@ -138,25 +197,35 @@
 .ft-chat-bubble {
   max-width: 82%;
   padding: 0.6rem 0.75rem;
-  border-radius: 9px;
-  border: 1px solid #e0e8ef;
-  background: #fff;
-  box-shadow: 0 1px 2px rgba(20, 44, 68, 0.04);
+  border-radius: 10px;
+  border: 1px solid var(--ft-border);
+  background: rgba(255, 255, 255, 0.06);
+  color: var(--ft-text);
   overflow-wrap: anywhere;
 }
+/* Assistant er uttor — bam e patla teal dag (sidebar er active link er moto) */
+.ft-chat-msg-assistant .ft-chat-bubble {
+  border-left: 2px solid var(--ft-teal-light);
+  border-top-left-radius: 4px;
+}
+/* User er bubble dan dike, tai dan er upor kona choto */
 .ft-chat-msg-user .ft-chat-bubble {
-  background: #102a43;
-  color: #fff;
-  border-color: #102a43;
+  border-top-right-radius: 4px;
+}
+.ft-chat-msg-user .ft-chat-bubble {
+  background: var(--ft-teal);
+  color: #04201d;
+  border-color: var(--ft-teal);
 }
 .ft-chat-msg-error .ft-chat-bubble {
-  background: #fff4f4;
-  border-color: #f1c0c0;
-  color: #6b1a1a;
+  background: rgba(248, 113, 113, 0.1);
+  border-color: rgba(248, 113, 113, 0.4);
+  color: #f87171;
 }
 .ft-chat-msg-offtopic .ft-chat-bubble {
   border-style: dashed;
-  border-color: #c9a86a;
+  border-color: #fbbf24;
+  border-left-style: solid;
 }
 .ft-chat-text {
   margin: 0;
@@ -169,11 +238,11 @@
   margin-top: 0.45rem;
   padding: 0.15rem 0.45rem;
   border-radius: 999px;
-  background: #fef3d6;
-  color: #6b4a00;
+  background: rgba(251, 191, 36, 0.12);
+  color: #fbbf24;
   font-size: 0.7rem;
   font-weight: 600;
-  border: 1px solid #f0d48a;
+  border: 1px solid rgba(251, 191, 36, 0.3);
 }
 .ft-chat-sources {
   margin-top: 0.5rem;
@@ -185,9 +254,9 @@
   display: inline-block;
   padding: 0.15rem 0.45rem;
   border-radius: 999px;
-  background: #eef4f7;
-  border: 1px solid #d9e2ec;
-  color: #334e68;
+  background: var(--ft-teal-soft);
+  border: 1px solid rgba(45, 212, 191, 0.3);
+  color: var(--ft-teal-light);
   font-size: 0.7rem;
   font-weight: 500;
 }
@@ -203,7 +272,7 @@
   width: 6px;
   height: 6px;
   border-radius: 50%;
-  background: #829ab1;
+  background: var(--ft-teal-light);
   animation: ft-bounce 1.2s infinite ease-in-out both;
 }
 .ft-chat-dot:nth-child(1) { animation-delay: -0.32s; }
@@ -213,44 +282,55 @@
   40% { transform: scale(1); opacity: 1; }
 }
 
-/* Suggestions */
+/* Footer (suggestion + input) — chat er jayga theke alada, ektu gadho band */
+.ft-chat-footer {
+  background: rgba(0, 0, 0, 0.28);
+  border-top: 1px solid var(--ft-border-hover);
+}
+
+/* Suggestions — ek line e, pashe scroll (mouse chaka diyeo). Dane halka fade = aro ache bojhay */
 .ft-chat-suggestions {
   display: flex;
-  flex-wrap: wrap;
   gap: 0.4rem;
-  padding: 0.6rem 0.9rem 0.2rem;
-  background: #fff;
-  border-top: 1px solid #e8eef3;
+  overflow-x: auto;
+  scrollbar-width: none;
+  padding: 0.6rem 2rem 0.6rem 0.9rem;
+  mask-image: linear-gradient(to right, #000 82%, transparent);
+  border-bottom: 1px solid var(--ft-border); /* chip lukano thakle eta o nai — tai double dag hoy na */
 }
+.ft-chat-suggestions::-webkit-scrollbar { display: none; }
 .ft-chat-chip {
-  padding: 0.32rem 0.6rem;
+  flex: 0 0 auto;
+  white-space: nowrap;
+  animation: ft-chip-in 0.35s ease backwards;
+  padding: 0.26rem 0.55rem;
   border-radius: 999px;
-  border: 1px solid #d9e2ec;
-  background: #f8fafb;
-  color: #243b53;
-  font-size: 0.76rem;
+  border: 1px solid rgba(45, 212, 191, 0.3);
+  background: var(--ft-teal-soft);
+  color: var(--ft-teal-light);
+  font-size: 0.73rem;
   font-weight: 500;
   cursor: pointer;
-  transition: background 0.15s, border-color 0.15s;
+  transition: background 0.15s, border-color 0.15s, color 0.15s;
 }
 .ft-chat-chip:hover:not(:disabled) {
-  background: #eef4f7;
-  border-color: #1f7a8c;
+  background: rgba(45, 212, 191, 0.22);
+  border-color: var(--ft-teal-light);
+  color: #fff;
 }
 .ft-chat-chip:disabled {
   opacity: 0.5;
   cursor: not-allowed;
 }
 .ft-chat-chip:focus-visible {
-  outline: 2px solid #1f7a8c;
+  outline: 2px solid var(--ft-teal-light);
   outline-offset: 2px;
 }
 
 /* Input area */
 .ft-chat-input-area {
-  padding: 0.7rem 0.9rem 0.8rem;
-  background: #fff;
-  border-top: 1px solid #e8eef3;
+  padding: 0.6rem 0.9rem 0.8rem;
+  background: transparent;
   display: flex;
   flex-direction: column;
   gap: 0.5rem;
@@ -260,22 +340,26 @@
   min-height: 44px;
   max-height: 92px;
   padding: 0.55rem 0.65rem;
-  border: 1px solid #d9e2ec;
-  border-radius: 9px;
+  border: 1px solid var(--ft-border);
+  border-radius: 10px;
   font-family: 'DM Sans', Arial, sans-serif;
   font-size: 0.88rem;
   line-height: 1.4;
-  color: #1c2d41;
-  background: #fff;
+  color: var(--ft-text);
+  background: var(--ft-surface);
   resize: vertical;
+  transition: border-color 0.2s, box-shadow 0.2s;
+}
+.ft-chat-textarea::placeholder {
+  color: var(--ft-muted);
 }
 .ft-chat-textarea:focus {
   outline: none;
-  border-color: #1f7a8c;
-  box-shadow: 0 0 0 3px rgba(31, 122, 140, 0.12);
+  border-color: var(--ft-teal);
+  box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.12);
 }
 .ft-chat-textarea:disabled {
-  background: #f4f7fa;
+  background: var(--ft-surface-hover);
   opacity: 0.7;
 }
 .ft-chat-controls {
@@ -286,41 +370,43 @@
 }
 .ft-chat-count {
   font-size: 0.72rem;
-  color: #829ab1;
+  color: var(--ft-muted);
 }
 .ft-chat-count-error {
-  color: #b42318;
+  color: #f87171;
   font-weight: 600;
 }
 .ft-chat-actions {
   display: flex;
   gap: 0.45rem;
 }
+/* 💡 button — Clear chat er moto dark; suggestion khola thakle teal */
 .ft-chat-suggest-toggle {
-  display: inline-flex;
-  align-items: center;
-  justify-content: center;
-  width: 32px;
-  height: 32px;
+  display: inline-grid;
+  place-items: center;
+  width: 34px;
   padding: 0;
   border-radius: 6px;
-  border: 1px solid #d9e2ec;
-  background: #fff;
-  color: #334e68;
+  border: 1px solid var(--ft-border);
+  background: var(--ft-surface);
   font-size: 0.95rem;
   line-height: 1;
   cursor: pointer;
+  filter: grayscale(1) opacity(0.6);
+  transition: background 0.2s, border-color 0.2s, filter 0.2s;
 }
 .ft-chat-suggest-toggle:hover {
-  background: #f4f7fa;
+  background: var(--ft-surface-hover);
+  border-color: var(--ft-border-hover);
+  filter: none;
 }
 .ft-chat-suggest-toggle.is-active {
-  background: #eef4f7;
-  border-color: #1f7a8c;
-  color: #1f7a8c;
+  background: var(--ft-teal-soft);
+  border-color: rgba(45, 212, 191, 0.4);
+  filter: none;
 }
 .ft-chat-suggest-toggle:focus-visible {
-  outline: 2px solid #102a43;
+  outline: 2px solid var(--ft-teal-light);
   outline-offset: 2px;
 }
 
@@ -332,22 +418,25 @@
   font-size: 0.82rem;
   font-weight: 600;
   cursor: pointer;
+  transition: background 0.2s, border-color 0.2s, color 0.2s;
 }
 .ft-chat-clear {
-  background: #fff;
-  border-color: #d9e2ec;
-  color: #334e68;
+  background: var(--ft-surface);
+  border-color: var(--ft-border);
+  color: var(--ft-text);
 }
 .ft-chat-clear:hover:not(:disabled) {
-  background: #f4f7fa;
+  background: var(--ft-surface-hover);
+  border-color: var(--ft-border-hover);
 }
 .ft-chat-send {
-  background: #1f7a8c;
-  color: #fff;
-  border-color: #1f7a8c;
+  background: var(--ft-teal);
+  color: #04201d;
+  border-color: var(--ft-teal);
 }
 .ft-chat-send:hover:not(:disabled) {
-  background: #175a69;
+  background: var(--ft-teal-light);
+  border-color: var(--ft-teal-light);
 }
 .ft-chat-clear:disabled,
 .ft-chat-send:disabled {
@@ -356,10 +445,104 @@
 }
 .ft-chat-clear:focus-visible,
 .ft-chat-send:focus-visible {
-  outline: 2px solid #102a43;
+  outline: 2px solid var(--ft-teal-light);
   outline-offset: 2px;
 }
 
+/* =====================================================================
+   Live element + transition (chat ke "zinda" dekhanor jonno)
+   index.css er "reduce motion" rule egulo automatic bondho kore dey
+   ===================================================================== */
+
+/* Launcher er charpashe teal dheu (live-dot er moto pulse) */
+.ft-chat-launcher::after {
+  content: '';
+  position: absolute;
+  inset: -1px;
+  border-radius: inherit;
+  pointer-events: none;
+  animation: ft-ring 2.6s ease-out infinite;
+}
+@keyframes ft-ring {
+  0% { box-shadow: 0 0 0 0 rgba(45, 212, 191, 0.45); }
+  100% { box-shadow: 0 0 0 12px rgba(45, 212, 191, 0); }
+}
+.ft-chat-launcher-icon .dna-helix { width: 14px; gap: 3px; }
+
+/* Panel khulle niche-dan kona theke pop kore ashe */
+.ft-chat-panel {
+  transform-origin: bottom right;
+  animation: ft-panel-in 0.28s cubic-bezier(0.2, 0.8, 0.2, 1);
+}
+@keyframes ft-panel-in {
+  from { opacity: 0; transform: translateY(10px) scale(0.94); }
+  to { opacity: 1; transform: none; }
+}
+
+/* Title er pashe choto "live" dot (index.css er .live-dot) */
+.ft-chat-title .live-dot {
+  display: inline-block;
+  vertical-align: middle;
+  margin-left: 0.35rem;
+}
+
+/* Header er teal alo dhire dhire nore */
+.ft-chat-header {
+  background-size: 160% 160%;
+  animation: ft-glow 8s ease-in-out infinite alternate;
+}
+@keyframes ft-glow {
+  from { background-position: 0% 0%; }
+  to { background-position: 40% 30%; }
+}
+
+/* Notun message niche theke fade hoye ashe; user er ta dan theke */
+.ft-chat-msg { animation: ft-msg-in 0.3s ease backwards; }
+.ft-chat-msg-user { animation-name: ft-msg-in-right; }
+@keyframes ft-msg-in {
+  from { opacity: 0; transform: translateY(8px); }
+  to { opacity: 1; transform: none; }
+}
+@keyframes ft-msg-in-right {
+  from { opacity: 0; transform: translateX(12px); }
+  to { opacity: 1; transform: none; }
+}
+
+/* Chip gula ekta por ekta ashe; hover e ektu upore */
+.ft-chat-chip:nth-child(2) { animation-delay: 0.05s; }
+.ft-chat-chip:nth-child(3) { animation-delay: 0.1s; }
+.ft-chat-chip:nth-child(n + 4) { animation-delay: 0.15s; }
+@keyframes ft-chip-in {
+  from { opacity: 0; transform: translateX(10px); }
+  to { opacity: 1; transform: none; }
+}
+.ft-chat-chip { transition: background 0.15s, border-color 0.15s, color 0.15s, transform 0.15s; }
+.ft-chat-chip:hover:not(:disabled) { transform: translateY(-1px); }
+
+/* Button — hover e upore, click e chapa */
+.ft-chat-send,
+.ft-chat-clear,
+.ft-chat-suggest-toggle,
+.ft-chat-icon-btn {
+  transition: background 0.2s, border-color 0.2s, color 0.2s, filter 0.2s, transform 0.15s;
+}
+.ft-chat-send:hover:not(:disabled),
+.ft-chat-clear:hover:not(:disabled),
+.ft-chat-suggest-toggle:hover,
+.ft-chat-icon-btn:hover { transform: translateY(-1px); }
+.ft-chat-send:active:not(:disabled),
+.ft-chat-clear:active:not(:disabled),
+.ft-chat-suggest-toggle:active,
+.ft-chat-icon-btn:active { transform: scale(0.95); }
+
+/* 💡 on korle "jole othe" */
+.ft-chat-suggest-toggle.is-active { animation: ft-bulb-on 0.4s ease; }
+@keyframes ft-bulb-on {
+  0% { transform: scale(0.85); box-shadow: 0 0 0 0 rgba(45, 212, 191, 0.5); }
+  60% { transform: scale(1.08); }
+  100% { transform: none; box-shadow: 0 0 0 8px rgba(45, 212, 191, 0); }
+}
+
 /* Visually hidden for a11y */
 .visually-hidden {
   position: absolute !important;
@@ -375,11 +558,13 @@
 
 /* Responsive */
 @media (max-width: 480px) {
-  .ft-chat-panel {
+  .ft-chat-panel,
+  .ft-chat-panel.ft-chat-panel-max {
     right: 0;
     bottom: 0;
     width: 100vw;
     height: 100vh;
+    max-width: 100vw;
     max-height: 100vh;
     border-radius: 0;
     border-left: none;
@@ -389,4 +574,9 @@
     right: 14px;
     bottom: 14px;
   }
+  /* Mobile e panel already full screen — resize / maximize lage na */
+  .ft-chat-resize,
+  .ft-chat-max {
+    display: none;
+  }
 }
```

### `frontend/src/index.css` (modified)

```diff
diff --git a/frontend/src/index.css b/frontend/src/index.css
index f710ad3..2151898 100644
--- a/frontend/src/index.css
+++ b/frontend/src/index.css
@@ -23,6 +23,8 @@
   font-family: 'DM Sans', Arial, sans-serif;
   color: var(--ft-text);
   background: var(--ft-bg);
+  /* Browser ke bola page ta dark — tai select er dropdown list, date picker, scrollbar o kalo hoy */
+  color-scheme: dark;
 }
 
 /* Bootstrap dark mode er rong (index.html e data-bs-theme="dark") — blue er jaygay teal */
@@ -256,10 +258,11 @@ body::before {
   background: var(--ft-teal-light);
   transition: width .1s linear;
 }
+/* Chatbot er "Help" button niche-dane thake, tai eta tar upore (22px + button ~50px + gap) */
 .back-to-top {
   position: fixed;
   right: 1.5rem;
-  bottom: 1.5rem;
+  bottom: 5.25rem;
   z-index: 1030;
   width: 40px;
   height: 40px;
@@ -394,6 +397,17 @@ body::before {
   color: #fff;
 }
 .form-control::placeholder { color: rgba(160, 172, 175, 0.5); }
+/* Select khulle je list ashe (option) — noile shada background e halka lekha, pora jay na */
+option, optgroup { background-color: var(--ft-surface-solid); color: var(--ft-text); }
+/* Browser autofill (login e) shada/nil background dey — eke dark kora */
+input:-webkit-autofill,
+input:-webkit-autofill:hover,
+input:-webkit-autofill:focus {
+  -webkit-text-fill-color: var(--ft-text);
+  caret-color: var(--ft-text);
+  box-shadow: 0 0 0 1000px #15191b inset;
+  transition: background-color 9999s ease-out;
+}
 .form-label { color: #b9c2c4; font-size: .85rem; }
 .form-check-input:checked { background-color: var(--ft-teal); border-color: var(--ft-teal); }
 .form-check-input:focus { border-color: var(--ft-teal); box-shadow: 0 0 0 .2rem rgba(45, 212, 191, 0.15); }
```

### `frontend/src/components/FamilyMembersManager.jsx` (modified)

```diff
diff --git a/frontend/src/components/FamilyMembersManager.jsx b/frontend/src/components/FamilyMembersManager.jsx
index dfd0ff4..a9feeef 100644
--- a/frontend/src/components/FamilyMembersManager.jsx
+++ b/frontend/src/components/FamilyMembersManager.jsx
@@ -256,9 +256,9 @@ export default function FamilyMembersManager({ personId = null, allowDnaRegistra
 
       {/* Add / Edit Family Member Form */}
       {showForm && (
-        <div className="card mb-4 border-primary">
-          <div className="card-header bg-primary text-white d-flex justify-content-between align-items-center">
-            <h5 className="mb-0">{editingId ? 'Edit Family Member' : 'Add New Family Member'}</h5>
+        <div className="card mb-4">
+          <div className="card-header bg-white d-flex justify-content-between align-items-center">
+            <strong>{editingId ? 'Edit Family Member' : 'Add New Family Member'}</strong>
             <button
               type="button"
               className="btn btn-sm btn-light"
@@ -432,12 +432,12 @@ export default function FamilyMembersManager({ personId = null, allowDnaRegistra
               </div>
 
               <div className="col-12 d-flex gap-2">
-                <button type="submit" className="btn btn-success">
+                <button type="submit" className="btn btn-primary">
                   {editingId ? 'Update Family Member' : 'Save Family Member'}
                 </button>
                 <button
                   type="button"
-                  className="btn btn-secondary"
+                  className="btn btn-light"
                   onClick={() => setShowForm(false)}
                 >
                   Cancel
@@ -450,11 +450,11 @@ export default function FamilyMembersManager({ personId = null, allowDnaRegistra
 
       {/* Register Family DNA Sample Modal/Card */}
       {dnaTargetMember && (
-        <div className="card mb-4 border-info">
-          <div className="card-header bg-info text-dark d-flex justify-content-between align-items-center">
-            <h5 className="mb-0">
+        <div className="card mb-4">
+          <div className="card-header bg-white d-flex justify-content-between align-items-center">
+            <strong>
               Register Reference DNA Sample — {dnaTargetMember.first_name} {dnaTargetMember.last_name} ({dnaTargetMember.relationship})
-            </h5>
+            </strong>
             <button
               type="button"
               className="btn btn-sm btn-light"
@@ -547,12 +547,12 @@ export default function FamilyMembersManager({ personId = null, allowDnaRegistra
               </div>
 
               <div className="col-12 d-flex gap-2">
-                <button type="submit" className="btn btn-info">
+                <button type="submit" className="btn btn-primary">
                   Confirm & Register DNA Sample
                 </button>
                 <button
                   type="button"
-                  className="btn btn-secondary"
+                  className="btn btn-light"
                   onClick={() => setDnaTargetMember(null)}
                 >
                   Cancel
@@ -596,7 +596,7 @@ export default function FamilyMembersManager({ personId = null, allowDnaRegistra
                         {m.email && <small className="text-muted">{m.email}</small>}
                       </td>
                       <td>
-                        <span className="badge bg-secondary">{m.relationship}</span>
+                        <span className="badge text-bg-secondary status-badge">{m.relationship}</span>
                       </td>
                       {!personId && (
                         <td>
@@ -612,7 +612,7 @@ export default function FamilyMembersManager({ personId = null, allowDnaRegistra
                         <div className="d-flex justify-content-end gap-2">
                           {allowDnaRegistration && (
                             <button
-                              className="btn btn-sm btn-outline-info"
+                              className="btn btn-sm btn-outline-primary"
                               onClick={() => handleOpenDnaModal(m)}
                             >
                               Register DNA
```

### `frontend/src/pages/DnaLabsPage.jsx` (modified)

```diff
diff --git a/frontend/src/pages/DnaLabsPage.jsx b/frontend/src/pages/DnaLabsPage.jsx
index 6315495..e0a9d2f 100644
--- a/frontend/src/pages/DnaLabsPage.jsx
+++ b/frontend/src/pages/DnaLabsPage.jsx
@@ -130,7 +130,7 @@ export default function DnaLabsPage() {
     });
 
     return (
-        <div className="container-fluid py-4">
+        <>
             <PageHeader
                 title="DNA Laboratories"
                 subtitle="Manage and oversee registered forensic DNA testing facilities."
@@ -148,16 +148,16 @@ export default function DnaLabsPage() {
                 }
             />
 
-            {error && <div className="alert alert-danger my-3 shadow-sm">{error}</div>}
-            {success && <div className="alert alert-success my-3 shadow-sm">{success}</div>}
+            {error && <div className="alert alert-danger">{error}</div>}
+            {success && <div className="alert alert-success">{success}</div>}
 
             {/* Collapsible / Toggleable Form */}
             {showForm && (
-                <div className="card shadow-sm border-0 mb-4 bg-light">
-                    <div className="card-body p-4">
-                        <h5 className="card-title fw-bold mb-3">
-                            {editingId ? 'Edit DNA Laboratory' : 'Register New DNA Laboratory'}
-                        </h5>
+                <div className="card mb-4">
+                    <div className="card-header bg-white">
+                        <strong>{editingId ? 'Edit DNA Laboratory' : 'Register New DNA Laboratory'}</strong>
+                    </div>
+                    <div className="card-body">
                         <form onSubmit={handleSubmit}>
                             <div className="row g-3">
                                 <div className="col-md-6">
@@ -224,7 +224,7 @@ export default function DnaLabsPage() {
                                     <button type="submit" className="btn btn-primary px-4">
                                         {editingId ? 'Update Laboratory' : 'Save Laboratory'}
                                     </button>
-                                    <button type="button" className="btn btn-outline-secondary" onClick={resetForm}>
+                                    <button type="button" className="btn btn-light" onClick={resetForm}>
                                         Cancel
                                     </button>
                                 </div>
@@ -235,7 +235,7 @@ export default function DnaLabsPage() {
             )}
 
             {/* Filter / Search Bar */}
-            <div className="card mb-4 shadow-sm border-0">
+            <div className="card mb-4">
                 <div className="card-body">
                     <div className="row g-3 align-items-end">
                         <div className="col-md-5">
@@ -286,10 +286,10 @@ export default function DnaLabsPage() {
                     <p className="mt-2 text-secondary">Loading live laboratory records...</p>
                 </div>
             ) : (
-                <div className="card shadow-sm border-0">
+                <div className="card">
                     <div className="table-responsive">
                         <table className="table table-hover align-middle mb-0">
-                            <thead className="table-light">
+                            <thead>
                                 <tr>
                                     <th className="ps-4">ID</th>
                                     <th>Lab Name</th>
@@ -303,7 +303,7 @@ export default function DnaLabsPage() {
                             <tbody>
                                 {filteredLabs.length === 0 ? (
                                     <tr>
-                                        <td colSpan="7" className="text-center py-4 text-muted">
+                                        <td colSpan="7" className="text-center py-4 text-secondary">
                                             No DNA laboratories found matching your criteria.
                                         </td>
                                     </tr>
@@ -311,13 +311,13 @@ export default function DnaLabsPage() {
                                     filteredLabs.map((lab) => (
                                         <tr key={lab.lab_id}>
                                             <td className="ps-4 fw-bold text-secondary">#{lab.lab_id}</td>
-                                            <td className="fw-semibold text-dark">{lab.lab_name}</td>
+                                            <td className="fw-semibold">{lab.lab_name}</td>
                                             <td>
-                                                <span className="badge bg-light text-dark border">
+                                                <span className="badge text-bg-secondary status-badge">
                                                     {lab.city}
                                                 </span>
                                             </td>
-                                            <td className="small text-muted" style={{ maxWidth: '220px' }}>
+                                            <td className="small text-secondary" style={{ maxWidth: '220px' }}>
                                                 {lab.address}
                                             </td>
                                             <td className="small">{lab.contact_number}</td>
@@ -348,6 +348,6 @@ export default function DnaLabsPage() {
                     </div>
                 </div>
             )}
-        </div>
+        </>
     );
 }
\ No newline at end of file
```

### `frontend/src/pages/LabTechniciansPage.jsx` (modified)

```diff
diff --git a/frontend/src/pages/LabTechniciansPage.jsx b/frontend/src/pages/LabTechniciansPage.jsx
index edf5ba5..88160a0 100644
--- a/frontend/src/pages/LabTechniciansPage.jsx
+++ b/frontend/src/pages/LabTechniciansPage.jsx
@@ -183,7 +183,7 @@ export default function LabTechniciansPage() {
     });
 
     return (
-        <div className="container-fluid py-4">
+        <>
             <PageHeader
                 title="Lab Technicians"
                 subtitle="Manage forensic laboratory technicians and personnel assignments."
@@ -201,16 +201,16 @@ export default function LabTechniciansPage() {
                 }
             />
 
-            {error && <div className="alert alert-danger my-3 shadow-sm">{error}</div>}
-            {success && <div className="alert alert-success my-3 shadow-sm">{success}</div>}
+            {error && <div className="alert alert-danger">{error}</div>}
+            {success && <div className="alert alert-success">{success}</div>}
 
             {/* Collapsible / Toggleable Form */}
             {showForm && (
-                <div className="card shadow-sm border-0 mb-4 bg-light">
-                    <div className="card-body p-4">
-                        <h5 className="card-title fw-bold mb-3">
-                            {editingId ? 'Edit Lab Technician' : 'Register New Lab Technician'}
-                        </h5>
+                <div className="card mb-4">
+                    <div className="card-header bg-white">
+                        <strong>{editingId ? 'Edit Lab Technician' : 'Register New Lab Technician'}</strong>
+                    </div>
+                    <div className="card-body">
                         <form onSubmit={handleSubmit}>
                             <div className="row g-3">
                                 <div className="col-md-6">
@@ -294,7 +294,7 @@ export default function LabTechniciansPage() {
                                     <button type="submit" className="btn btn-primary px-4">
                                         {editingId ? 'Update Technician' : 'Save Technician'}
                                     </button>
-                                    <button type="button" className="btn btn-outline-secondary" onClick={resetForm}>
+                                    <button type="button" className="btn btn-light" onClick={resetForm}>
                                         Cancel
                                     </button>
                                 </div>
@@ -305,7 +305,7 @@ export default function LabTechniciansPage() {
             )}
 
             {/* Filter / Search Bar */}
-            <div className="card mb-4 shadow-sm border-0">
+            <div className="card mb-4">
                 <div className="card-body">
                     <div className="row g-3 align-items-end">
                         <div className="col-md-5">
@@ -356,10 +356,10 @@ export default function LabTechniciansPage() {
                     <p className="mt-2 text-secondary">Loading live technician records...</p>
                 </div>
             ) : (
-                <div className="card shadow-sm border-0">
+                <div className="card">
                     <div className="table-responsive">
                         <table className="table table-hover align-middle mb-0">
-                            <thead className="table-light">
+                            <thead>
                                 <tr>
                                     <th className="ps-4">ID</th>
                                     <th>Technician Name</th>
@@ -373,7 +373,7 @@ export default function LabTechniciansPage() {
                             <tbody>
                                 {filteredTechnicians.length === 0 ? (
                                     <tr>
-                                        <td colSpan="7" className="text-center py-4 text-muted">
+                                        <td colSpan="7" className="text-center py-4 text-secondary">
                                             No technicians found matching your criteria.
                                         </td>
                                     </tr>
@@ -381,37 +381,37 @@ export default function LabTechniciansPage() {
                                     filteredTechnicians.map((tech) => (
                                         <tr key={tech.technician_id}>
                                             <td className="ps-4 fw-bold text-secondary">#{tech.technician_id}</td>
-                                            <td className="fw-semibold text-dark">
+                                            <td className="fw-semibold">
                                                 {tech.first_name} {tech.last_name}
                                             </td>
                                             <td>
                                                 <div>
                                                     <span className="fw-medium">{tech.lab_name}</span>
                                                     {tech.lab_city && (
-                                                        <span className="badge bg-light text-secondary ms-2 border">
+                                                        <span className="badge text-bg-secondary status-badge ms-2">
                                                             {tech.lab_city}
                                                         </span>
                                                     )}
                                                 </div>
                                             </td>
                                             <td>
-                                                <span className="badge bg-info-subtle text-info-emphasis border">
+                                                <span className="badge text-bg-primary status-badge">
                                                     {tech.designation}
                                                 </span>
                                             </td>
                                             <td>
                                                 <div className="small text-primary">{tech.email}</div>
-                                                <div className="small text-muted">{tech.phone}</div>
+                                                <div className="small text-secondary">{tech.phone}</div>
                                             </td>
                                             <td>
                                                 {tech.user_id ? (
-                                                    <span className="badge bg-success-subtle text-success-emphasis border">
+                                                    <span className="badge text-bg-success status-badge">
                                                         Linked: User #{tech.user_id}
                                                     </span>
                                                 ) : (
                                                     <button
                                                         type="button"
-                                                        className="btn btn-sm btn-outline-info"
+                                                        className="btn btn-sm btn-outline-primary"
                                                         onClick={() => {
                                                             setLinkingTech(tech);
                                                             setUserIdInput('');
@@ -506,6 +506,6 @@ export default function LabTechniciansPage() {
                     </div>
                 </div>
             )}
-        </div>
+        </>
     );
 }
\ No newline at end of file
```

### `frontend/src/pages/FamilyMembersPage.jsx` (modified)

```diff
diff --git a/frontend/src/pages/FamilyMembersPage.jsx b/frontend/src/pages/FamilyMembersPage.jsx
index 3a1173e..c43a267 100644
--- a/frontend/src/pages/FamilyMembersPage.jsx
+++ b/frontend/src/pages/FamilyMembersPage.jsx
@@ -4,12 +4,12 @@ import FamilyMembersManager from '../components/FamilyMembersManager';
 
 export default function FamilyMembersPage() {
   return (
-    <div className="container-fluid py-3">
+    <>
       <PageHeader
         title="Family Members"
         subtitle="Manage family contacts of missing persons and register reference DNA samples"
       />
       <FamilyMembersManager />
-    </div>
+    </>
   );
 }
\ No newline at end of file
```

## UI Phase 3 testing

| Test | Result |
|---|---|
| `vite build` | ✅ |
| Chat panel screenshot (headless Edge, built CSS, static markup of every message type) | ✅ Panel matches cards; user bubble teal with readable dark text; source tag, off-topic badge, error bubble, typing dots, chips, Clear / Send all on theme |
| Launcher closed screenshot | ✅ "Help" launcher bottom-right, back-to-top now above it (no overlap) |
| Select option list + date input screenshot | ✅ Options dark with readable text, calendar icon light |
| Grep of all `.jsx` for inline hex colours / light Bootstrap classes (`text-black`, `bg-info`, `text-bg-light`, `table-light` …) | ✅ Nothing left that sets a light background or dark text (only the dark modal backdrop) |
| Grep for leftover `btn-info` / `btn-secondary` / `bg-primary` / `bg-info` / `-subtle` / `container-fluid` / `border-0` cards in `src/` | ✅ None left (except the intentional green Confirm / Activate buttons) |

## Known gaps after UI Phase 3

| Item | Note |
|---|---|
| `PoliceStations.jsx` | Still unused + Tailwind. Team decision whether to delete |
| Real app check | Screenshots used static markup (login + backend needed for the real widget). Open the app once and click through the chatbot to confirm |
