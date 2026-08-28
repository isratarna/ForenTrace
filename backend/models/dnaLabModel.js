import db from '../config/db.js';

export const getAllLabs = async () => {
    const [rows] = await db.query('SELECT * FROM dna_labs ORDER BY lab_id ASC');
    return rows;
};

export const getLabById = async (id) => {
    const [rows] = await db.query('SELECT * FROM dna_labs WHERE lab_id = ?', [id]);
    return rows[0];
};

export const getLabByEmail = async (email) => {
    const [rows] = await db.query('SELECT * FROM dna_labs WHERE email = ?', [email]);
    return rows[0];
};

export const createLab = async (labData) => {
    const { lab_name, city, address, contact_number, email } = labData;
    const [result] = await db.query(
        'INSERT INTO dna_labs (lab_name, city, address, contact_number, email) VALUES (?, ?, ?, ?, ?)',
        [lab_name, city, address, contact_number, email]
    );
    return result.insertId;
};

export const updateLab = async (id, labData) => {
    const { lab_name, city, address, contact_number, email } = labData;
    const [result] = await db.query(
        'UPDATE dna_labs SET lab_name = ?, city = ?, address = ?, contact_number = ?, email = ? WHERE lab_id = ?',
        [lab_name, city, address, contact_number, email, id]
    );
    return result.affectedRows;
};

export const getTechnicianCountByLabId = async (labId) => {
    const [rows] = await db.query(
        'SELECT COUNT(*) as total FROM lab_technicians WHERE lab_id = ?',
        [labId]
    );
    return rows[0]?.total || 0;
};

export const deleteLab = async (id) => {
    const [result] = await db.query('DELETE FROM dna_labs WHERE lab_id = ?', [id]);
    return result.affectedRows;
};