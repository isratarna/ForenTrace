-- ==============================================================================
-- Issue 7: SQL INTERSECTION Query (Member 2)
-- Description: Finds Missing Persons who have BOTH a registered Case File 
--              AND at least one registered Family Member.
-- Method: Using standard MySQL intersection logic (IN subqueries).
-- ==============================================================================

SELECT mp.person_id, mp.first_name, mp.last_name, mp.status
FROM missing_persons mp
WHERE mp.person_id IN (
    SELECT person_id FROM case_files
)
AND mp.person_id IN (
    SELECT person_id FROM family_members
);