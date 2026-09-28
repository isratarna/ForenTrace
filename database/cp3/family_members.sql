-- =========================================================
-- ForenTrace: Family Member Module Queries (Member 2 - Issue 1)
-- File: database/sql/family_members.sql
-- =========================================================

-- 1. Add Family Member (INSERT)
INSERT INTO family_members (
    person_id, first_name, last_name, relationship, gender, 
    phone, email, national_id, blood_group, address, remarks
) VALUES (
    1, 'Rafiqul', 'Islam', 'Father', 'Male', 
    '01711000001', 'rafiqul@example.com', '1975123456789', 'B+', 
    'Dhanmondi, Dhaka', 'Willing to provide DNA reference sample'
);

-- 2. View All Family Members with Missing Person Info (SELECT)
SELECT 
    fm.*,
    mp.first_name AS missing_person_first_name,
    mp.last_name AS missing_person_last_name,
    mp.status AS missing_person_status
FROM family_members fm
JOIN missing_persons mp ON fm.person_id = mp.person_id
ORDER BY fm.created_at DESC;

-- 3. View Family Members by Missing Person ID (SELECT)
SELECT * 
FROM family_members 
WHERE person_id = 1 
ORDER BY created_at DESC;

-- 4. View Single Family Member by ID (SELECT)
SELECT 
    fm.*,
    mp.first_name AS missing_person_first_name,
    mp.last_name AS missing_person_last_name
FROM family_members fm
JOIN missing_persons mp ON fm.person_id = mp.person_id
WHERE fm.family_id = 1;

-- 5. Edit Family Member (UPDATE)
UPDATE family_members
SET 
    first_name = 'Rafiqul',
    last_name = 'Islam',
    relationship = 'Father',
    gender = 'Male',
    phone = '01711999999',
    email = 'rafiqul.updated@example.com',
    national_id = '1975123456789',
    blood_group = 'B+',
    address = 'Mirpur, Dhaka',
    remarks = 'Updated phone number and address'
WHERE family_id = 1;

-- 6. Remove Family Member (DELETE)
DELETE FROM family_members 
WHERE family_id = 1;