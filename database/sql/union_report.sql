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
