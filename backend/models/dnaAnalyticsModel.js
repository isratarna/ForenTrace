//Ei file-ti holo database engine-er sathe raw SQL-e kotha bolar core jaiga। 
// Ekhane sir-er 3-ti required queries implement kora hoyeche:

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

    INNER JOIN dna_labs dl 
    ON lt.lab_id = dl.lab_id

    LEFT JOIN users u 
    ON lt.user_id = u.user_id
    
    ORDER BY dl.city ASC, lt.technician_id ASC
  `);
  return rows;
};
//INNER JOIN dna_labs dl ON lt.lab_id = dl.lab_id: Proti technician mandatory ekta DNA lab-e assigned thake। 
// INNER JOIN ensures shudhu valid assigned lab information-i result-e ashbe।
//left join = Eta Outer Join। Karon ekjon technician-er login user account thakteo pare (user_id = 1), abar NULL-o thakte pare।

// Query 2: Aggregate with GROUP BY & HAVING (Staffing count per DNA lab)

export const getLabCapacityAnalytics = async (minTechnicians = 0) => {
  const query = `
    SELECT 
      dl.lab_id,
      dl.lab_name,
      dl.city,
      dl.contact_number,
      COUNT(lt.technician_id) AS total_technicians
    FROM dna_labs dl
    LEFT JOIN lab_technicians lt 
    ON dl.lab_id = lt.lab_id
    GROUP BY dl.lab_id, dl.lab_name, dl.city, dl.contact_number
    HAVING total_technicians >= ?
    ORDER BY total_technicians DESC, dl.lab_name ASC
  `;
  const [rows] = await db.query(query, [parseInt(minTechnicians, 10) || 0]);
  return rows;
};

// Query 3: Nested Subquery (DNA Labs with above-average staffing capacity)
export const getAboveAverageCapacityLabs = async () => {
  const query = `
    SELECT 
      dl.lab_id,
      dl.lab_name,
      dl.city,
      COUNT(lt.technician_id) AS technician_count,
      
      -- Subquery 1: Select System Average as a column
      ROUND((
        SELECT AVG(tech_count) 
        FROM (
          SELECT COUNT(technician_id) AS tech_count 
          FROM dna_labs 
          LEFT JOIN lab_technicians USING (lab_id) 
          GROUP BY lab_id
        ) AS avg_table
      ), 2) AS system_avg_technicians

    FROM dna_labs dl
    LEFT JOIN lab_technicians lt ON dl.lab_id = lt.lab_id
    
    GROUP BY 
      dl.lab_id, 
      dl.lab_name, 
      dl.city
    
    -- Subquery 2: Filter labs having count >= System Average
    HAVING technician_count >= (
      SELECT AVG(tech_count) 
      FROM (
        SELECT COUNT(technician_id) AS tech_count 
        FROM dna_labs 
        LEFT JOIN lab_technicians USING (lab_id) 
        GROUP BY lab_id
      ) AS avg_table
    )
    
    ORDER BY technician_count DESC;
  `;

  const [rows] = await db.query(query);
  return rows;
};