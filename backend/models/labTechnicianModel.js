import db from '../config/db.js';

// Get all technicians with lab information
export const getAllTechnicians = async () => {
    const [rows] = await db.query(`
    SELECT lt.*, dl.lab_name, dl.city as lab_city
    FROM lab_technicians lt
    JOIN dna_labs dl ON lt.lab_id = dl.lab_id
    ORDER BY lt.technician_id ASC
  `);
    return rows;
};

// Get single technician by ID
export const getTechnicianById = async (id) => {
    const [rows] = await db.query(`
    SELECT lt.*, dl.lab_name, dl.city as lab_city
    FROM lab_technicians lt
    JOIN dna_labs dl ON lt.lab_id = dl.lab_id
    WHERE lt.technician_id = ?
  `, [id]);
    return rows[0];
};

// Check email uniqueness
export const getTechnicianByEmail = async (email) => {
    const [rows] = await db.query('SELECT * FROM lab_technicians WHERE email = ?', [email]);
    return rows[0];
};

// Create technician
export const createTechnician = async (data) => {
    const { lab_id, first_name, last_name, designation, phone, email } = data;
    const [result] = await db.query(
        'INSERT INTO lab_technicians (lab_id, first_name, last_name, designation, phone, email) VALUES (?, ?, ?, ?, ?, ?)',
        [lab_id, first_name, last_name, designation, phone, email]
    );
    return result.insertId;
};

// Update technician
export const updateTechnician = async (id, data) => {
    const { lab_id, first_name, last_name, designation, phone, email } = data;
    const [result] = await db.query(
        'UPDATE lab_technicians SET lab_id = ?, first_name = ?, last_name = ?, designation = ?, phone = ?, email = ? WHERE technician_id = ?',
        [lab_id, first_name, last_name, designation, phone, email, id]
    );
    return result.affectedRows;
};

// Delete technician
export const deleteTechnician = async (id) => {
    const [result] = await db.query('DELETE FROM lab_technicians WHERE technician_id = ?', [id]);
    return result.affectedRows;
};

// Link technician to a user account (1:1 mapping)
export const linkUserAccount = async (technicianId, userId) => {
    const [result] = await db.query(
        'UPDATE lab_technicians SET user_id = ? WHERE technician_id = ?',
        [userId, technicianId]
    );
    return result.affectedRows;
};

// Check if user is already linked to another technician
export const getTechnicianByUserId = async (userId) => {
    const [rows] = await db.query(
        'SELECT * FROM lab_technicians WHERE user_id = ?',
        [userId]
    );
    return rows[0];
};