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
