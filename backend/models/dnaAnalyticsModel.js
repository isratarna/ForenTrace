import db from '../config/db.js';

// Query 1: Multitable JOIN (DNA Labs + Technicians + Users)
export const getTechnicianLabOverview = async () => {
    const [rows] = await db.query(`
    SELECT 
      lt.technician_id,
      CONCAT(lt.first_name, ' ', lt.last_name) AS technician_name,
      lt.designation,
      lt.phone AS technician_phone,
      lt.email AS technician_email,
      dl.lab_id,
      dl.lab_name,
      dl.city AS lab_city,
      dl.contact_number AS lab_contact,
      u.user_id,
      u.username,
      u.account_status
    FROM lab_technicians lt
    INNER JOIN dna_labs dl ON lt.lab_id = dl.lab_id
    LEFT JOIN users u ON lt.user_id = u.user_id
    ORDER BY dl.city ASC, lt.technician_id ASC
  `);
    return rows;
};