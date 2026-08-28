USE railway;

-- INNER JOIN
-- CaseFile records enriched with their MissingPerson, PoliceStation, and Officer.
SELECT
    cf.case_id,
    cf.person_id,
    CONCAT(mp.first_name, ' ', mp.last_name) AS missing_person_name,
    cf.station_id,
    ps.station_name,
    cf.officer_id,
    CONCAT(o.first_name, ' ', o.last_name) AS officer_name,
    o.badge_number,
    cf.report_date,
    cf.case_status,
    cf.priority,
    cf.identified_date,
    cf.case_notes
FROM case_files AS cf
INNER JOIN missing_persons AS mp ON cf.person_id = mp.person_id
INNER JOIN police_stations AS ps ON cf.station_id = ps.station_id
INNER JOIN officers AS o ON cf.officer_id = o.officer_id
ORDER BY cf.case_id;

-- NESTED SUBQUERY
-- Officers whose station-scoped CaseFile count is greater than the average
-- workload of officers who currently have at least one assigned CaseFile.
-- The grouped active_officer_workloads derived table is nested inside the
-- aggregate workload_average subquery; the WHERE clause is also correlated
-- with the outer Officer row through both officer_id and station_id.
SELECT
    o.officer_id,
    CONCAT(o.first_name, ' ', o.last_name) AS officer_name,
    o.badge_number,
    o.station_id,
    ps.station_name,
    (
        SELECT COUNT(*)
        FROM case_files AS assigned_cases
        WHERE assigned_cases.officer_id = o.officer_id
          AND assigned_cases.station_id = o.station_id
    ) AS assigned_case_count,
    workload_average.average_active_officer_workload
FROM officers AS o
INNER JOIN police_stations AS ps ON ps.station_id = o.station_id
CROSS JOIN (
    SELECT
        ROUND(AVG(active_officer_workloads.assigned_case_count), 2)
            AS average_active_officer_workload
    FROM (
        SELECT
            cf.station_id,
            cf.officer_id,
            COUNT(*) AS assigned_case_count
        FROM case_files AS cf
        GROUP BY cf.station_id, cf.officer_id
    ) AS active_officer_workloads
) AS workload_average
WHERE (
    SELECT COUNT(*)
    FROM case_files AS assigned_cases
    WHERE assigned_cases.officer_id = o.officer_id
      AND assigned_cases.station_id = o.station_id
) > workload_average.average_active_officer_workload
ORDER BY assigned_case_count DESC, officer_name ASC;

-- LEFT JOIN
-- Every PoliceStation is retained, including stations with zero CaseFiles.
SELECT
    ps.station_id,
    ps.station_name,
    COUNT(cf.case_id) AS total_cases,
    SUM(CASE WHEN cf.case_status = 'Active' THEN 1 ELSE 0 END) AS active_cases,
    SUM(CASE WHEN cf.case_status = 'Solved' THEN 1 ELSE 0 END) AS solved_cases,
    SUM(CASE WHEN cf.case_status = 'Pending' THEN 1 ELSE 0 END) AS pending_cases
FROM police_stations AS ps
LEFT JOIN case_files AS cf ON cf.station_id = ps.station_id
GROUP BY ps.station_id, ps.station_name
ORDER BY total_cases DESC, ps.station_name;

-- RIGHT JOIN
-- Every Officer is retained, including officers with no assigned CaseFile.
SELECT
    o.officer_id,
    CONCAT(o.first_name, ' ', o.last_name) AS officer_name,
    o.badge_number,
    ps.station_name,
    COUNT(cf.case_id) AS total_cases
FROM case_files AS cf
RIGHT JOIN officers AS o ON cf.officer_id = o.officer_id
INNER JOIN police_stations AS ps ON o.station_id = ps.station_id
GROUP BY o.officer_id, o.first_name, o.last_name, o.badge_number, ps.station_name
ORDER BY total_cases DESC, officer_name;

-- FULL JOIN simulation
-- MySQL has no FULL OUTER JOIN. UNION removes the duplicate matched rows from
-- the LEFT JOIN and RIGHT JOIN results while retaining unmatched rows from both.
SELECT
    cf.case_id,
    cf.case_status,
    cf.station_id AS case_station_id,
    o.officer_id,
    o.station_id AS officer_station_id,
    CONCAT(o.first_name, ' ', o.last_name) AS officer_name,
    o.badge_number
FROM case_files AS cf
LEFT JOIN officers AS o ON cf.officer_id = o.officer_id

UNION

SELECT
    cf.case_id,
    cf.case_status,
    cf.station_id AS case_station_id,
    o.officer_id,
    o.station_id AS officer_station_id,
    CONCAT(o.first_name, ' ', o.last_name) AS officer_name,
    o.badge_number
FROM case_files AS cf
RIGHT JOIN officers AS o ON cf.officer_id = o.officer_id
ORDER BY officer_id, case_id;

-- JOIN-based CaseFile search
-- This Workbench example is directly runnable. The API uses the same predicates
-- with prepared-statement placeholders for user-supplied values.
SET @case_search = 'Hasan';
SET @case_search_id = CASE
    WHEN @case_search REGEXP '^[0-9]+$' THEN CAST(@case_search AS UNSIGNED)
    ELSE 0
END;

SELECT
    cf.case_id,
    CONCAT(mp.first_name, ' ', mp.last_name) AS missing_person_name,
    ps.station_name,
    CONCAT(o.first_name, ' ', o.last_name) AS officer_name,
    o.badge_number,
    cf.case_status,
    cf.priority
FROM case_files AS cf
INNER JOIN missing_persons AS mp ON cf.person_id = mp.person_id
INNER JOIN police_stations AS ps ON cf.station_id = ps.station_id
INNER JOIN officers AS o ON cf.officer_id = o.officer_id
WHERE cf.case_id = @case_search_id
   OR CONCAT(mp.first_name, ' ', mp.last_name) LIKE CONCAT('%', @case_search, '%')
   OR ps.station_name LIKE CONCAT('%', @case_search, '%')
   OR CONCAT(o.first_name, ' ', o.last_name) LIKE CONCAT('%', @case_search, '%')
   OR o.badge_number LIKE CONCAT('%', @case_search, '%')
ORDER BY cf.case_id;
