USE forentrace_db;

DROP PROCEDURE IF EXISTS issue5_transaction_demo;
DELIMITER //
CREATE PROCEDURE issue5_transaction_demo()
BEGIN
    DECLARE v_role_id INT DEFAULT NULL;
    DECLARE v_lab_id INT DEFAULT NULL;
    DECLARE v_token CHAR(32);
    DECLARE v_rollback_token CHAR(32);
    DECLARE v_username VARCHAR(100);
    DECLARE v_email VARCHAR(100);
    DECLARE v_rollback_username VARCHAR(100);
    DECLARE v_rollback_email VARCHAR(100);
    DECLARE v_user_id INT DEFAULT NULL;
    DECLARE v_technician_id INT DEFAULT NULL;
    DECLARE v_rollback_user_id INT DEFAULT NULL;
    DECLARE v_rollback_technician_id INT DEFAULT NULL;
    DECLARE v_password_hash VARCHAR(255) DEFAULT '$2b$10$micQq.JC80DS7Yn4gJaliuxUf6BUiYCbLfdV9pA6Kr3qL/y6XARa.';

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    SELECT role_id INTO v_role_id
    FROM roles
    WHERE role_name = 'Lab Technician'
    LIMIT 1;

    SELECT lab_id INTO v_lab_id
    FROM dna_labs
    ORDER BY lab_id
    LIMIT 1;

    IF v_role_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Seed the Lab Technician role before running this demo.';
    END IF;

    IF v_lab_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Seed at least one DNA lab before running this demo.';
    END IF;

    -- Successful transaction: create the user, assigned technician profile, and both links.
    SET v_token = REPLACE(UUID(), '-', '');
    SET v_username = CONCAT('issue5_tx_', v_token);
    SET v_email = CONCAT('issue5_tx_', v_token, '@example.invalid');

    INSERT INTO users
        (role_id, officer_id, technician_id, username, password_hash, email, account_status)
    VALUES
        (v_role_id, NULL, NULL, v_username, v_password_hash, v_email, 'pending_approval');
    SET v_user_id = LAST_INSERT_ID();

    INSERT INTO lab_technicians
        (lab_id, user_id, first_name, last_name, designation, phone, email)
    VALUES
        (v_lab_id, v_user_id, 'Issue5 Demo', 'Success', 'Issue 5 SQL transaction demonstration', '555-ISSUE5', v_email);
    SET v_technician_id = LAST_INSERT_ID();

    UPDATE users
    SET technician_id = v_technician_id
    WHERE user_id = v_user_id;

    COMMIT;

    SELECT
        'COMMITTED' AS transaction_result,
        u.user_id,
        u.username,
        u.email,
        u.account_status,
        lt.technician_id,
        lt.lab_id,
        lt.user_id AS linked_user_id
    FROM users u
    JOIN lab_technicians lt ON lt.user_id = u.user_id
    WHERE u.user_id = v_user_id;

    -- Rollback demonstration: repeat the multi-step inserts with a unique test identity,
    -- then explicitly discard both records. No existing account or technician is changed.
    START TRANSACTION;

    SET v_rollback_token = REPLACE(UUID(), '-', '');
    SET v_rollback_username = CONCAT('issue5_rb_', v_rollback_token);
    SET v_rollback_email = CONCAT('issue5_rb_', v_rollback_token, '@example.invalid');

    INSERT INTO users
        (role_id, officer_id, technician_id, username, password_hash, email, account_status)
    VALUES
        (v_role_id, NULL, NULL, v_rollback_username, v_password_hash, v_rollback_email, 'pending_approval');
    SET v_rollback_user_id = LAST_INSERT_ID();

    INSERT INTO lab_technicians
        (lab_id, user_id, first_name, last_name, designation, phone, email)
    VALUES
        (v_lab_id, v_rollback_user_id, 'Issue5 Demo', 'Rollback', 'Issue 5 rollback demonstration', '555-ISSUE5', v_rollback_email);
    SET v_rollback_technician_id = LAST_INSERT_ID();

    UPDATE users
    SET technician_id = v_rollback_technician_id
    WHERE user_id = v_rollback_user_id;

    ROLLBACK;

    SELECT
        'ROLLED BACK (both counts should be 0)' AS transaction_result,
        (SELECT COUNT(*) FROM users WHERE user_id = v_rollback_user_id) AS remaining_users,
        (SELECT COUNT(*) FROM lab_technicians WHERE technician_id = v_rollback_technician_id) AS remaining_technicians;
END//
DELIMITER ;

CALL issue5_transaction_demo();
DROP PROCEDURE issue5_transaction_demo;