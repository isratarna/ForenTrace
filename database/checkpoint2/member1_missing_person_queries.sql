USE railway;

-- These queries require the case_files, police_stations, and officers tables
-- and their foreign-key relationships to be installed before execution.

-- INNER JOIN
-- Missing persons that have a case file.
SELECT mp.person_id, CONCAT(mp.first_name, ' ', mp.last_name) AS missing_person,
       cf.case_id, cf.case_status
FROM missing_persons AS mp
INNER JOIN case_files AS cf ON cf.person_id = mp.person_id
ORDER BY mp.person_id;

-- MULTI-TABLE INNER JOIN
-- Missing person, case, station, and investigating officer.
SELECT mp.person_id, CONCAT(mp.first_name, ' ', mp.last_name) AS missing_person,
       cf.case_id, cf.case_status, ps.station_name AS police_station,
       CONCAT(o.first_name, ' ', o.last_name) AS investigating_officer
FROM missing_persons AS mp
INNER JOIN case_files AS cf ON cf.person_id = mp.person_id
INNER JOIN police_stations AS ps ON ps.station_id = cf.station_id
INNER JOIN officers AS o ON o.officer_id = cf.officer_id
ORDER BY cf.case_id;

-- LEFT JOIN
-- Every missing person is retained, including people without a case file.
SELECT mp.person_id, CONCAT(mp.first_name, ' ', mp.last_name) AS missing_person,
       cf.case_id, cf.case_status
FROM missing_persons AS mp
LEFT JOIN case_files AS cf ON cf.person_id = mp.person_id
ORDER BY mp.person_id;

-- RIGHT JOIN
-- Every case file is retained, even if its person-side row is absent.
SELECT mp.person_id, CONCAT(mp.first_name, ' ', mp.last_name) AS missing_person,
       cf.case_id, cf.person_id AS case_person_id, cf.case_status
FROM missing_persons AS mp
RIGHT JOIN case_files AS cf ON cf.person_id = mp.person_id
ORDER BY cf.case_id;

-- FULL JOIN SIMULATION
-- MySQL has no native FULL OUTER JOIN. The LEFT JOIN preserves every
-- missing_persons row and the RIGHT JOIN adds unmatched case_files rows.
SELECT mp.person_id, CONCAT(mp.first_name, ' ', mp.last_name) AS missing_person,
       cf.case_id, cf.person_id AS case_person_id, cf.case_status
FROM missing_persons AS mp
LEFT JOIN case_files AS cf ON cf.person_id = mp.person_id
UNION
SELECT mp.person_id, CONCAT(mp.first_name, ' ', mp.last_name) AS missing_person,
       cf.case_id, cf.person_id AS case_person_id, cf.case_status
FROM missing_persons AS mp
RIGHT JOIN case_files AS cf ON cf.person_id = mp.person_id
WHERE mp.person_id IS NULL
ORDER BY person_id;

-- AGGREGATE STATISTICS
-- Summary uses COUNT, SUM, MIN, MAX, AVG, CASE, and conditional aggregation.
SELECT COUNT(*) AS total_missing_persons,
       SUM(CASE WHEN status = 'Missing' THEN 1 ELSE 0 END) AS currently_missing,
       SUM(CASE WHEN status = 'Identified' THEN 1 ELSE 0 END) AS identified,
       COUNT(DISTINCT city) AS cities_affected,
       MIN(missing_date) AS earliest_missing_date,
       MAX(missing_date) AS latest_missing_date,
       ROUND(AVG(height), 2) AS average_height,
       ROUND(AVG(weight), 2) AS average_weight
FROM missing_persons;

-- City-level conditional aggregation and ordering.
SELECT city, COUNT(*) AS total_persons,
       SUM(CASE WHEN status = 'Missing' THEN 1 ELSE 0 END) AS currently_missing,
       SUM(CASE WHEN status = 'Identified' THEN 1 ELSE 0 END) AS identified
FROM missing_persons
WHERE city IS NOT NULL AND city <> ''
GROUP BY city
ORDER BY total_persons DESC, city ASC;

-- HAVING: cities with at least two records.
SELECT city, COUNT(*) AS total_persons
FROM missing_persons
WHERE city IS NOT NULL AND city <> ''
GROUP BY city
HAVING COUNT(*) >= 2
ORDER BY total_persons DESC;

-- NESTED SUBQUERY
-- Correlated outer query: return people whose city count is greater than
-- the average city count calculated by the nested derived table.
SELECT mp.person_id, mp.first_name, mp.last_name, mp.city, mp.status,
       mp.missing_date
FROM missing_persons AS mp
WHERE EXISTS (
    SELECT 1
    FROM (
        SELECT city, COUNT(*) AS city_count
        FROM missing_persons
        WHERE city IS NOT NULL AND city <> ''
        GROUP BY city
    ) AS city_counts
    WHERE city_counts.city = mp.city
      AND city_counts.city_count > (
          SELECT AVG(city_count)
          FROM (
              SELECT city, COUNT(*) AS city_count
              FROM missing_persons
              WHERE city IS NOT NULL AND city <> ''
              GROUP BY city
          ) AS average_city_counts
      )
)
ORDER BY mp.city, mp.person_id;