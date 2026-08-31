use railway;

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

-- Seed DNA Labs (Member 2 Checkpoint 2)

INSERT INTO dna_labs (lab_name, city, address, contact_number, email) VALUES
('Central Forensic DNA Laboratory', 'Dhaka', 'CID Headquarters, Malibagh, Dhaka', '+8801711000001', 'cfdl.dhaka@forentrace.gov'),
('National Forensic DNA Profiling Laboratory', 'Dhaka', 'Dhaka Medical College Campus, Dhaka', '+8801711000002', 'nfdpl.dmc@forentrace.gov'),
('Regional DNA Screening Lab', 'Chittagong', 'Chittagong Medical College, Chittagong', '+8801711000003', 'rdsl.ctg@forentrace.gov'),
('Sylhet Forensic Analysis Lab', 'Sylhet', 'Osmani Medical College Road, Sylhet', '+8801711000004', 'sfal.sylhet@forentrace.gov')
ON DUPLICATE KEY UPDATE lab_name=VALUES(lab_name);

-- 1. Insert valid technicians for existing labs (lab_id 1, 2, 3)
INSERT INTO lab_technicians (lab_id, first_name, last_name, designation, phone, email) VALUES
(1, 'Tanvir', 'Hossain', 'Senior DNA Analyst', '+8801811000001', 'tanvir.dna@forentrace.gov'),
(1, 'Amina', 'Begum', 'Forensic Lab Technician', '+8801811000002', 'amina.lab@forentrace.gov'),
(2, 'Kamrul', 'Hasan', 'DNA Specialist', '+8801811000003', 'kamrul.dna@forentrace.gov'),
(3, 'Farhana', 'Akter', 'Junior Serologist', '+8801811000004', 'farhana.lab@forentrace.gov');
ON DUPLICATE KEY UPDATE designation=VALUES(designation);

--Database Seeding (database/seed.sql): 5-ti realistic DNA Labs ebong 5-ti Lab Technicians test data insert kora hoyeche.