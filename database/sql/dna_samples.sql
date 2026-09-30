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
-- Backend er sampleSelect (dnaSampleModel.js) hubohu ei column gulo ney
SELECT
    s.*,
    CONCAT(mp.first_name, ' ', mp.last_name) AS person_name,
    mp.status AS person_status,             -- missing person er current status (Identified kina)
    CONCAT(fm.first_name, ' ', fm.last_name) AS family_member_name,
    fm.relationship AS family_relationship,
    dl.lab_name,
    CONCAT(lt.first_name, ' ', lt.last_name) AS technician_name,
    cf.case_id,
    cf.officer_id AS case_officer_id        -- case er investigating officer
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


-- =========================================================
-- Backend search, filter & lookup queries (Member 1 - Issue 1)
-- GET /api/dna-samples?search=&status=&person_id=&family_id=&lab_id=&case_id=
-- Backend (findAllSamples) shudhu je filter pathano hoy sheta AND diye jog kore —
-- ekhane proti ta filter alada kore test kora holo.
-- =========================================================

-- 21. Search: sample id, person name, family member name, lab name, sample type ba profile code diye
-- Example search text = 'Rafiqul'. Backend e ekhane ? placeholder thake:
--   sample_id = ? → search text number hole sheta, noile 0 (ekhane 'Rafiqul' number na, tai 0)
--   LIKE ?        → '%Rafiqul%' (wildcard shoho)
-- Note: @variable diye LIKE korle collation mismatch hote pare, tai literal value use kora holo
--       (backend er ? parameter o literal hishebe bind hoy)
SELECT
    s.sample_id,
    CONCAT(mp.first_name, ' ', mp.last_name) AS person_name,
    CONCAT(fm.first_name, ' ', fm.last_name) AS family_member_name,
    dl.lab_name,
    s.sample_type,
    s.dna_profile_code,
    s.status
FROM dna_samples s
INNER JOIN missing_persons mp ON s.person_id = mp.person_id
LEFT JOIN family_members fm ON s.family_id = fm.family_id
LEFT JOIN dna_labs dl ON s.lab_id = dl.lab_id
LEFT JOIN lab_technicians lt ON s.technician_id = lt.technician_id
LEFT JOIN case_files cf ON cf.person_id = s.person_id
WHERE 1 = 1
  AND (
    s.sample_id = 0
    OR CONCAT(mp.first_name, ' ', mp.last_name) LIKE '%Rafiqul%'
    OR CONCAT(fm.first_name, ' ', fm.last_name) LIKE '%Rafiqul%'
    OR dl.lab_name LIKE '%Rafiqul%'
    OR s.sample_type LIKE '%Rafiqul%'
    OR s.dna_profile_code LIKE '%Rafiqul%'
  )
ORDER BY s.sample_id DESC;


-- 22a. Filter: status (e.g. shudhu 'Analyzed' sample — New DNA Comparison page eta use kore)
SELECT s.sample_id, s.status, s.dna_profile_code
FROM dna_samples s
WHERE 1 = 1
  AND s.status = 'Analyzed'
ORDER BY s.sample_id DESC;

-- 22b. Filter: person_id (Missing Person Details → DNA Samples tab)
SELECT s.sample_id, s.person_id, s.sample_type
FROM dna_samples s
WHERE 1 = 1
  AND s.person_id = 1
ORDER BY s.sample_id DESC;

-- 22c. Filter: family_id (ekta family member er reference sample)
SELECT s.sample_id, s.family_id, s.sample_type
FROM dna_samples s
WHERE 1 = 1
  AND s.family_id = 1
ORDER BY s.sample_id DESC;

-- 22d. Filter: lab_id (ekta lab er sample)
SELECT s.sample_id, s.lab_id, s.status
FROM dna_samples s
WHERE 1 = 1
  AND s.lab_id = 2
ORDER BY s.sample_id DESC;

-- 22e. Filter: case_id (Case Details er DNA Samples — case_files LEFT JOIN diye)
SELECT s.sample_id, cf.case_id, s.person_id
FROM dna_samples s
LEFT JOIN case_files cf ON cf.person_id = s.person_id
WHERE 1 = 1
  AND cf.case_id = 1
ORDER BY s.sample_id DESC;

-- 22f. Combined: backend ekshathe onek filter + role scope AND kore (e.g. Officer 1 er Analyzed sample)
SELECT s.sample_id, CONCAT(mp.first_name, ' ', mp.last_name) AS person_name, s.status, cf.case_id
FROM dna_samples s
INNER JOIN missing_persons mp ON s.person_id = mp.person_id
LEFT JOIN case_files cf ON cf.person_id = s.person_id
WHERE 1 = 1
  AND s.status = 'Analyzed'
  AND s.person_id = 1
  AND cf.officer_id = 1           -- Officer scope (query 3 er condition)
ORDER BY s.sample_id DESC;


-- 23. Lookup: missing person ache kina (register/update/family DNA view er age)
SELECT person_id FROM missing_persons WHERE person_id = 1 LIMIT 1;


-- 24. Lookup: DNA lab ache kina (register/update er age)
SELECT lab_id FROM dna_labs WHERE lab_id = 1 LIMIT 1;
