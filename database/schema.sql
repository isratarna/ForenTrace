use railway;
CREATE TABLE roles (
    role_id INT AUTO_INCREMENT PRIMARY KEY,
    role_name VARCHAR(50) NOT NULL UNIQUE,
    description VARCHAR(255)
);

CREATE TABLE users (
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
CREATE TABLE police_stations (
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
