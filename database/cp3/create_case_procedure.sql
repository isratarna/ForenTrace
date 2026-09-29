-- ==============================================================================
-- Issue 6: SQL Stored Procedure for Case Creation (Member 2)
-- Description: Handles multiple inserts/updates to create a new case efficiently.
-- ==============================================================================

DROP PROCEDURE IF EXISTS create_case;

DELIMITER //

CREATE PROCEDURE create_case(
    IN p_person_id INT,
    IN p_station_id INT,
    IN p_officer_id INT,
    IN p_priority VARCHAR(20),
    IN p_case_notes TEXT
)
BEGIN
    -- 1. Insert case 
    -- 2. Link missing person (p_person_id) 
    -- 3. Assign investigating officer (p_officer_id, p_station_id)
    -- 4. Set initial case status ('Active')
    INSERT INTO case_files (
        person_id,
        station_id,
        officer_id,
        report_date,
        case_status,
        priority,
        case_notes
    ) VALUES (
        p_person_id,
        p_station_id,
        p_officer_id,
        CURDATE(),
        'Active',
        p_priority,
        p_case_notes
    );

    -- Additional Step: Automatically update the missing person's status
    UPDATE missing_persons 
    SET status = 'Under Investigation' 
    WHERE person_id = p_person_id;

END //

DELIMITER ;

-- ==============================================================================
-- Example usage (For Testing in MySQL Workbench):
-- CALL create_case(1, 1, 1, 'High', 'Initial investigation started for John Doe.');
-- ==============================================================================