-- ==============================================================================
-- Issue 7: SQL INTERSECTION Query (Member 2)
-- Description: Finds DNA labs that satisfy BOTH:
--              Condition 1: Above average laboratory capacity (technician count)
--              AND
--              Condition 2: Currently has active technicians
-- Method: Standard MySQL intersection logic using IN subqueries.
-- ==============================================================================

SELECT 
    dl.lab_name AS 'Lab Name',
    COUNT(lt.technician_id) AS 'Technician Count / Capacity'
FROM dna_labs dl
JOIN lab_technicians lt ON dl.lab_id = lt.lab_id
WHERE dl.lab_id IN (
    -- Condition 1: Labs with ABOVE AVERAGE capacity
    SELECT lab_id 
    FROM lab_technicians 
    GROUP BY lab_id 
    HAVING COUNT(technician_id) > (
        -- Calculate overall average technicians per lab
        SELECT COUNT(technician_id) / COUNT(DISTINCT lab_id) 
        FROM lab_technicians
    )
)
AND dl.lab_id IN (
    -- Condition 2: Labs that CURRENTLY have active technicians
    SELECT DISTINCT lab_id 
    FROM lab_technicians
)
GROUP BY dl.lab_id, dl.lab_name;