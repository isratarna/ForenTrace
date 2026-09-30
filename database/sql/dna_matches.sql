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
-- Note: backend ekhon same formula stored procedure diye chalay → compare_dna_samples_procedure.sql
--       (ei query ta standalone SELECT version — procedure er result er sathe hubohu mile)
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
-- Backend er matchSelect (dnaMatchModel.js) hubohu ei column gulo ney
SELECT
    m.match_id,
    m.unknown_sample_id,
    m.matched_sample_id,
    m.similarity_percentage,
    m.confidence_level,
    m.match_date,
    m.match_status,
    m.match_method,
    -- Unknown (evidence) sample er info
    u.person_id AS unknown_person_id,
    CONCAT(up.first_name, ' ', up.last_name) AS unknown_person_name,
    u.family_id AS unknown_family_id,
    CONCAT(uf.first_name, ' ', uf.last_name) AS unknown_family_name,
    uf.relationship AS unknown_family_relationship,
    u.sample_type AS unknown_sample_type,
    u.dna_profile_code AS unknown_profile_code,
    ul.lab_name AS unknown_lab_name,
    -- Matched (reference) sample er info
    ms.person_id AS matched_person_id,
    CONCAT(mp.first_name, ' ', mp.last_name) AS matched_person_name,
    mp.status AS matched_person_status,       -- trigger er por 'Identified' dekhabe (Issue 5)
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


-- =========================================================
-- Backend filter & delete queries (Member 1 - Issue 4)
-- GET /api/dna-matches?status=&confidence=&person_id=&case_id=&sample_id=
-- Backend (findAllMatches) shudhu je filter pathano hoy sheta AND diye jog kore —
-- ekhane proti ta filter alada kore test kora holo.
-- =========================================================

-- 11a. Filter: match_status (e.g. shudhu 'Pending Review' — review baki ache)
SELECT m.match_id, m.match_status
FROM dna_matches m
WHERE 1 = 1
  AND m.match_status = 'Pending Review'
ORDER BY m.match_id DESC;

-- 11b. Filter: confidence_level
SELECT m.match_id, m.similarity_percentage, m.confidence_level
FROM dna_matches m
WHERE 1 = 1
  AND m.confidence_level = 'High'
ORDER BY m.match_id DESC;

-- 11c. Filter: case_id (Case Details er DNA Matches — case er missing person er kono sample thakle)
SELECT m.match_id, m.unknown_sample_id, m.matched_sample_id
FROM dna_matches m
INNER JOIN dna_samples u ON u.sample_id = m.unknown_sample_id
INNER JOIN dna_samples ms ON ms.sample_id = m.matched_sample_id
WHERE 1 = 1
  AND EXISTS (
    SELECT 1
    FROM case_files cf_filter
    WHERE cf_filter.case_id = 1
      AND cf_filter.person_id IN (u.person_id, ms.person_id)
  )
ORDER BY m.match_id DESC;

-- 11d. Filter: sample_id (ekta sample je shob match e ache — unknown ba matched hishebe)
SELECT m.match_id, m.unknown_sample_id, m.matched_sample_id
FROM dna_matches m
WHERE 1 = 1
  AND (m.unknown_sample_id = 2 OR m.matched_sample_id = 2)
ORDER BY m.match_id DESC;


-- 12. Delete single match by id (DELETE /api/dna-matches/:id — shudhu Admin, Confirmed na hole)
-- Test er jonno ekta temporary match banie sheta delete kora
INSERT INTO dna_matches (unknown_sample_id, matched_sample_id, similarity_percentage, confidence_level, match_date, match_status, match_method)
VALUES (6, 1, 27.27, 'Low', CURDATE(), 'Pending Review', 'Computed');
SET @delete_match_id = LAST_INSERT_ID();

-- Delete er age status check (controller: Confirmed hole 409)
SELECT match_id, match_status FROM dna_matches WHERE match_id = @delete_match_id;

DELETE FROM dna_matches
WHERE match_id = @delete_match_id;
