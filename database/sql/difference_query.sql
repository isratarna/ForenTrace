-- Labs without any assigned technician (MySQL set-difference equivalent).
SELECT dl.lab_id, dl.lab_name, dl.city
FROM dna_labs dl
LEFT JOIN lab_technicians lt ON lt.lab_id = dl.lab_id
WHERE lt.technician_id IS NULL
ORDER BY dl.lab_id ASC;