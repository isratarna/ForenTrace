use railway;

-- Existing databases need this composite key for the case officer/station relationship.
DROP PROCEDURE IF EXISTS AddOfficerStationAssignmentKey;
DELIMITER //
CREATE PROCEDURE AddOfficerStationAssignmentKey()
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_schema = DATABASE()
          AND table_name = 'officers'
          AND constraint_name = 'unique_officer_station_assignment'
    ) THEN
        ALTER TABLE officers
            ADD CONSTRAINT unique_officer_station_assignment
            UNIQUE(station_id, officer_id);
    END IF;
END //
DELIMITER ;
CALL AddOfficerStationAssignmentKey();
DROP PROCEDURE IF EXISTS AddOfficerStationAssignmentKey;

CREATE TABLE IF NOT EXISTS case_files (
    -- Each case belongs to one missing person, station, and investigating officer.
    case_id INT AUTO_INCREMENT PRIMARY KEY,
    person_id INT NOT NULL,
    station_id INT NOT NULL,
    officer_id INT NOT NULL,
    report_date DATE NOT NULL,
    case_status VARCHAR(20) NOT NULL DEFAULT 'Active',
    priority VARCHAR(20) NOT NULL,
    identified_date DATE NULL,
    case_notes TEXT NULL,

    -- A missing person can have only one case file.
    UNIQUE(person_id),

    CONSTRAINT fk_case_station
        FOREIGN KEY (station_id) REFERENCES police_stations(station_id),

    CONSTRAINT fk_case_officer
        FOREIGN KEY (officer_id) REFERENCES officers(officer_id),

    CONSTRAINT fk_case_officer_station
        -- This prevents assigning an officer through a station they do not belong to.
        FOREIGN KEY (station_id, officer_id)
        REFERENCES officers(station_id, officer_id)
);

-- The MissingPerson module owns this table; add its relationship only when available.
DROP PROCEDURE IF EXISTS AddFkCasePerson;
DELIMITER //
CREATE PROCEDURE AddFkCasePerson()
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name = 'missing_persons'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_schema = DATABASE()
          AND table_name = 'case_files'
          AND constraint_name = 'fk_case_person'
    ) THEN
        ALTER TABLE case_files
            ADD CONSTRAINT fk_case_person
            FOREIGN KEY (person_id)
            REFERENCES missing_persons(person_id);
    END IF;
END //
DELIMITER ;
CALL AddFkCasePerson();
DROP PROCEDURE IF EXISTS AddFkCasePerson;
