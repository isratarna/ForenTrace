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