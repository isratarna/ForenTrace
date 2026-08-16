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