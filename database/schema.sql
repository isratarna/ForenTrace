CREATE DATABASE IF NOT EXISTS forentrace_db;
USE forentrace_db;

CREATE TABLE IF NOT EXISTS roles (
    role_id INT AUTO_INCREMENT PRIMARY KEY,
    role_name VARCHAR(50) NOT NULL UNIQUE,
    description VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    role_id INT NOT NULL,
    officer_id INT NULL,
    technician_id INT NULL,
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    account_status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL,

    CONSTRAINT fk_user_role
        FOREIGN KEY (role_id)
        REFERENCES roles(role_id)
);
CREATE TABLE IF NOT EXISTS police_stations (
    station_id INT AUTO_INCREMENT PRIMARY KEY,
    station_name VARCHAR(150) NOT NULL,
    district VARCHAR(100) NOT NULL,
    city VARCHAR(100) NOT NULL,
    address TEXT NOT NULL,
    contact_number VARCHAR(50) NOT NULL,
    email VARCHAR(150) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS officers (
    officer_id INT AUTO_INCREMENT PRIMARY KEY,
    station_id INT NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    `rank` VARCHAR(50) NOT NULL,
    badge_number VARCHAR(50) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(150) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(station_id, badge_number),
    CONSTRAINT unique_officer_station_assignment
        UNIQUE(station_id, officer_id),

    CONSTRAINT fk_officer_station
        FOREIGN KEY (station_id) REFERENCES police_stations(station_id)
);

-- Migration-safe stored procedure to add the foreign key constraint on users.officer_id
DROP PROCEDURE IF EXISTS AddFkUserOfficer;
DELIMITER //
CREATE PROCEDURE AddFkUserOfficer()
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_schema = DATABASE() 
          AND table_name = 'users' 
          AND constraint_name = 'fk_user_officer'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT fk_user_officer FOREIGN KEY (officer_id) REFERENCES officers(officer_id);
    END IF;
END //
DELIMITER ;
CALL AddFkUserOfficer();
DROP PROCEDURE IF EXISTS AddFkUserOfficer;

CREATE TABLE IF NOT EXISTS missing_persons (
    person_id INT AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    gender VARCHAR(20),
    date_of_birth DATE,
    national_id VARCHAR(50) UNIQUE,
    blood_group VARCHAR(10),
    height DECIMAL(5,2),
    weight DECIMAL(5,2),
    eye_color VARCHAR(50),
    hair_color VARCHAR(50),
    photo VARCHAR(255),
    missing_date DATE NOT NULL,
    last_seen_location VARCHAR(255),
    city VARCHAR(100),
    description TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'Missing'
);

CREATE TABLE IF NOT EXISTS case_files (
    case_id INT AUTO_INCREMENT PRIMARY KEY,
    person_id INT NOT NULL,
    station_id INT NOT NULL,
    officer_id INT NOT NULL,
    report_date DATE NOT NULL,
    case_status VARCHAR(20) NOT NULL DEFAULT 'Active',
    priority VARCHAR(20) NOT NULL,
    identified_date DATE NULL,
    case_notes TEXT NULL,

    UNIQUE(person_id),

    CONSTRAINT fk_case_station
        FOREIGN KEY (station_id) REFERENCES police_stations(station_id),

    CONSTRAINT fk_case_officer
        FOREIGN KEY (officer_id) REFERENCES officers(officer_id),

    CONSTRAINT fk_case_officer_station
        FOREIGN KEY (station_id, officer_id)
        REFERENCES officers(station_id, officer_id)
);

-- Add the missing-person relationship when the MissingPerson table is available.
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

-- Table: dna_labs
-- Scope: Member 2 (Checkpoint 2)urmee

CREATE TABLE IF NOT EXISTS dna_labs (
    lab_id INT AUTO_INCREMENT PRIMARY KEY,
    lab_name VARCHAR(150) NOT NULL,
    city VARCHAR(100) NOT NULL,
    address TEXT NOT NULL,
    contact_number VARCHAR(20) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
-- Table: lab_technicians
-- Scope: Member 2 (Checkpoint 2)urmee
-- Relationship: DNALab 1 : M LabTechnician

CREATE TABLE IF NOT EXISTS lab_technicians (
    technician_id INT AUTO_INCREMENT PRIMARY KEY,
    lab_id INT NOT NULL, -- FK
    user_id INT UNIQUE NULL, -- FK 1 to 1 relation with users table
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    designation VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (lab_id) REFERENCES dna_labs(lab_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE

    -- System user account delete hole technician delete hobe na, shudhu user_id null hoye jabe.
);

-- Family Members Table (Member 2 - Issue 1)
CREATE TABLE IF NOT EXISTS family_members (
    family_id INT AUTO_INCREMENT PRIMARY KEY,
    person_id INT NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    relationship VARCHAR(50) NOT NULL,
    gender VARCHAR(20),
    phone VARCHAR(30) NOT NULL,
    email VARCHAR(100),
    national_id VARCHAR(50),
    blood_group VARCHAR(10),
    address TEXT,
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_family_missing_person
        FOREIGN KEY (person_id) REFERENCES missing_persons(person_id)
        ON DELETE CASCADE
);

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

-- DNA Matches Table (Member 1 - Issue 4)
-- Raw SQL + query gulo: database/sql/dna_matches.sql
CREATE TABLE IF NOT EXISTS dna_matches (
    match_id INT AUTO_INCREMENT PRIMARY KEY,
    unknown_sample_id INT NOT NULL,          -- FK: unknown/evidence sample
    matched_sample_id INT NOT NULL,          -- FK: reference sample
    similarity_percentage DECIMAL(5,2) NOT NULL,
    confidence_level VARCHAR(10) NOT NULL,   -- High / Medium / Low
    match_date DATE NOT NULL,
    match_status VARCHAR(20) NOT NULL DEFAULT 'Pending Review', -- Pending Review / Confirmed / Rejected
    match_method VARCHAR(20) NOT NULL DEFAULT 'Computed',       -- Computed / Manual
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_match_pair UNIQUE (unknown_sample_id, matched_sample_id),
    CONSTRAINT chk_match_similarity CHECK (similarity_percentage BETWEEN 0 AND 100),
    CONSTRAINT fk_match_unknown_sample
        FOREIGN KEY (unknown_sample_id) REFERENCES dna_samples(sample_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_match_matched_sample
        FOREIGN KEY (matched_sample_id) REFERENCES dna_samples(sample_id)
        ON DELETE CASCADE
);

-- Trigger: DNA match Confirmed hole missing person automatic 'Identified' (Member 1 - Issue 5)
-- Raw SQL + test query gulo: database/sql/trigger.sql
DROP TRIGGER IF EXISTS trg_dna_match_confirmed_update;
DROP TRIGGER IF EXISTS trg_dna_match_confirmed_insert;
DELIMITER //
CREATE TRIGGER trg_dna_match_confirmed_update
AFTER UPDATE ON dna_matches
FOR EACH ROW
BEGIN
    -- Pending Review/Rejected theke notun kore 'Confirmed' holei
    IF NEW.match_status = 'Confirmed' AND OLD.match_status <> 'Confirmed' THEN
        UPDATE missing_persons
        SET status = 'Identified'
        WHERE person_id = (SELECT s.person_id FROM dna_samples s WHERE s.sample_id = NEW.matched_sample_id)
          AND status <> 'Identified';
    END IF;
END //
CREATE TRIGGER trg_dna_match_confirmed_insert
AFTER INSERT ON dna_matches
FOR EACH ROW
BEGIN
    -- Shorashori 'Confirmed' match insert holeo
    IF NEW.match_status = 'Confirmed' THEN
        UPDATE missing_persons
        SET status = 'Identified'
        WHERE person_id = (SELECT s.person_id FROM dna_samples s WHERE s.sample_id = NEW.matched_sample_id)
          AND status <> 'Identified';
    END IF;
END //
DELIMITER ;

-- Stored Procedure: duita DNA sample er profile code compare (Member 1 - Extra)
-- Raw SQL + test: database/sql/compare_dna_samples_procedure.sql
-- Backend: dnaMatchModel.compareProfileCodes() → CALL compare_dna_samples(...)
DROP PROCEDURE IF EXISTS compare_dna_samples;
DELIMITER //
CREATE PROCEDURE compare_dna_samples(
    IN  p_unknown_sample_id INT,
    IN  p_matched_sample_id INT,
    OUT p_matching_positions INT,
    OUT p_code_length INT,
    OUT p_similarity DECIMAL(5,2),
    OUT p_confidence VARCHAR(10)
)
BEGIN
    DECLARE v_unknown_code VARCHAR(100);
    DECLARE v_matched_code VARCHAR(100);
    DECLARE v_pos INT DEFAULT 1;
    DECLARE v_matching INT DEFAULT 0;

    SELECT dna_profile_code INTO v_unknown_code FROM dna_samples WHERE sample_id = p_unknown_sample_id;
    SELECT dna_profile_code INTO v_matched_code FROM dna_samples WHERE sample_id = p_matched_sample_id;

    -- Profile code na thakle compare kora jabe na
    IF v_unknown_code IS NULL OR v_matched_code IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Both samples must exist and have a DNA profile code.';
    END IF;

    -- Position-by-position character compare
    SET p_code_length = GREATEST(CHAR_LENGTH(v_unknown_code), CHAR_LENGTH(v_matched_code));
    WHILE v_pos <= p_code_length DO
        IF SUBSTRING(v_unknown_code, v_pos, 1) = SUBSTRING(v_matched_code, v_pos, 1) THEN
            SET v_matching = v_matching + 1;
        END IF;
        SET v_pos = v_pos + 1;
    END WHILE;

    SET p_matching_positions = v_matching;
    SET p_similarity = ROUND(v_matching / p_code_length * 100, 2);
    SET p_confidence = CASE
        WHEN p_similarity >= 90 THEN 'High'
        WHEN p_similarity >= 80 THEN 'Medium'
        ELSE 'Low'
    END;
END //
DELIMITER ;