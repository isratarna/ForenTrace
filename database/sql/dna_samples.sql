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
