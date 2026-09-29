CREATE DATABASE IF NOT EXISTS forentrace_db;
USE forentrace_db;

INSERT INTO roles (role_name, description)
VALUES
('Admin', 'System administrator'),
('Officer', 'Police officer'),
('Lab Technician', 'Forensic laboratory technician');


INSERT INTO users
(role_id, officer_id, technician_id, username, password_hash, email, account_status)
VALUES
(
    1,
    NULL,
    NULL,
    'admin',
    '$2b$10$SIZhAGMqFqNUe4kipcrsUeyLOhkLSqjV9Md0P77MvNl2.2WkOOTZu',
    'admin@forentrace.com',
    'active'
);

-- Seed police stations
INSERT INTO police_stations (station_id, station_name, district, city, address, contact_number, email)
VALUES
(1, 'Dhanmondi Police Station', 'Dhaka', 'Dhaka', 'Road 27, Dhanmondi', '+880 2 913 1941', 'dhanmondi@police.gov.bd'),
(2, 'Uttara Police Station', 'Dhaka', 'Dhaka', 'Sector 7, Uttara', '+880 2 891 4120', 'uttara@police.gov.bd'),
(3, 'Kotwali Police Station', 'Chattogram', 'Chattogram', 'Kotwali, Chattogram', '+880 31 611 911', 'kotwali@police.gov.bd')
ON DUPLICATE KEY UPDATE station_id=station_id;

-- Seed officers
INSERT INTO officers (officer_id, station_id, first_name, last_name, `rank`, badge_number, phone, email)
VALUES
(1, 1, 'Md.', 'Hasan', 'Inspector', 'BDP-4581', '+880 1711 992 002', 'hasan@police.gov.bd'),
(2, 2, 'Nusrat', 'Jahan', 'Sub-Inspector', 'BDP-4612', '+880 1712 489 110', 'nusrat@police.gov.bd')
ON DUPLICATE KEY UPDATE officer_id=officer_id;

-- Seed missing persons
INSERT INTO missing_persons (person_id, first_name, last_name, gender, date_of_birth, national_id, blood_group, height, weight, eye_color, hair_color, photo, missing_date, last_seen_location, city, description, status)
VALUES
(1, 'John', 'Doe', 'Male', '1995-03-12', 'NID-12345678', 'B+', 180.50, 75.00, 'Brown', 'Black', NULL, '2026-02-15', 'Sector 3', 'Dhaka', 'Last seen wearing blue jacket', 'Missing'),
(2, 'Jane', 'Smith', 'Female', '2001-08-20', 'NID-87654321', 'O-', 165.00, 55.50, 'Blue', 'Blonde', NULL, '2026-05-10', 'Road 27, Dhanmondi', 'Dhaka', 'Left home for university', 'Missing'),
(3, 'Rahim', 'Uddin', 'Male', '1988-11-05', 'NID-45612378', 'A+', 172.00, 68.00, 'Black', 'Black', NULL, '2026-01-20', 'Kotwali', 'Chattogram', 'Speaks local dialect', 'Identified')
ON DUPLICATE KEY UPDATE person_id=person_id;

-- Seed DNA Labs (Member 2 Checkpoint 2)urmeeee

INSERT INTO dna_labs (lab_name, city, address, contact_number, email) VALUES
('Central Forensic DNA Laboratory', 'Dhaka', 'CID Headquarters, Malibagh, Dhaka', '+8801711000001', 'cfdl.dhaka@forentrace.gov'),
('National Forensic DNA Profiling Laboratory', 'Dhaka', 'Dhaka Medical College Campus, Dhaka', '+8801711000002', 'nfdpl.dmc@forentrace.gov'),
('Regional DNA Screening Lab', 'Chittagong', 'Chittagong Medical College, Chittagong', '+8801711000003', 'rdsl.ctg@forentrace.gov'),
('Sylhet Forensic Analysis Lab', 'Sylhet', 'Osmani Medical College Road, Sylhet', '+8801711000004', 'sfal.sylhet@forentrace.gov')
ON DUPLICATE KEY UPDATE lab_name=VALUES(lab_name);

-- 1. Insert valid technicians for existing labs (lab_id 1, 2, 3) urmeeee
INSERT INTO lab_technicians (lab_id, first_name, last_name, designation, phone, email) VALUES
(1, 'Tanvir', 'Hossain', 'Senior DNA Analyst', '+8801811000001', 'tanvir.dna@forentrace.gov'),
(1, 'Amina', 'Begum', 'Forensic Lab Technician', '+8801811000002', 'amina.lab@forentrace.gov'),
(2, 'Kamrul', 'Hasan', 'DNA Specialist', '+8801811000003', 'kamrul.dna@forentrace.gov'),
(3, 'Farhana', 'Akter', 'Junior Serologist', '+8801811000004', 'farhana.lab@forentrace.gov')
ON DUPLICATE KEY UPDATE designation=VALUES(designation);

-- Database Seeding (database/seed.sql): 5-ti realistic DNA Labs ebong 5-ti Lab Technicians test data insert kora hoyeche.

-- Seed Data for family_members (Member 2 - Issue 1)
-- (dhore nicchi apnar missing_persons table-e person_id 1 ebong 2 ache)
INSERT INTO family_members (
    person_id, first_name, last_name, relationship, gender, phone, email, national_id, blood_group, address, remarks
) VALUES 
(1, 'Rafiqul', 'Islam', 'Father', 'Male', '01711000001', 'rafiqul@example.com', '1975123456789', 'B+', 'Dhanmondi, Dhaka', 'Willing to provide DNA reference sample'),
(1, 'Salma', 'Begum', 'Mother', 'Female', '01711000002', 'salma@example.com', '1980123456789', 'O+', 'Dhanmondi, Dhaka', 'Primary family contact'),
(2, 'Tanvir', 'Ahmed', 'Brother', 'Male', '01819000003', 'tanvir@example.com', '1995123456789', 'A+', 'Agrabad, Chattogram', 'Reported the missing case');

-- Seed Data for dna_samples (Member 1 - Issue 1)
-- family_id NULL = missing person/evidence sample, family_id thakle = family reference sample
INSERT INTO dna_samples (
    sample_id, person_id, family_id, lab_id, technician_id, sample_type, collection_date,
    storage_location, remarks, analysis_date, dna_profile_code, status
) VALUES
(1, 1, NULL, 1, 1, 'Personal Belonging', '2026-02-20', 'Evidence Room A-03', 'Toothbrush collected from residence', '2026-02-28', 'DNA7F2A91C4', 'Analyzed'),
(2, 1, 1, 1, 2, 'Buccal Swab', '2026-02-22', 'Cold Storage A-12', 'Reference sample from father', '2026-03-01', 'DNA7F2A91C9', 'Analyzed'),
(3, 1, 2, 1, NULL, 'Blood Sample', '2026-02-22', 'Cold Storage A-13', 'Reference sample from mother', NULL, NULL, 'Awaiting Analysis'),
(4, 2, 3, 2, 3, 'Buccal Swab', '2026-05-15', 'Freezer B-02', 'Reference sample from brother', NULL, NULL, 'Awaiting Analysis'),
(5, 2, NULL, 2, 3, 'Hair Strand', '2026-05-14', 'Evidence Room B-04', 'Hair strand from hostel room', '2026-05-20', 'DNA8C114A90', 'Analyzed'),
(6, 3, NULL, 3, 4, 'Bone Sample', '2026-01-25', 'Evidence Room C-01', 'Recovered remains sample', '2026-02-02', 'DNA5B7E20D1', 'Analyzed')
ON DUPLICATE KEY UPDATE sample_id = sample_id;