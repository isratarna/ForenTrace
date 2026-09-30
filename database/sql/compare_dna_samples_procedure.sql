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
