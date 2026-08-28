import db from '../config/db.js';

export async function findAllStations({ search } = {}) {
    let query = 'SELECT * FROM police_stations';
    const params = [];
    
    if (search) {
        query += ' WHERE station_name LIKE ? OR district LIKE ? OR city LIKE ?';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    
    const [rows] = await db.query(query, params);
    return rows;
}

export async function findStationById(id) {
    const [rows] = await db.query('SELECT * FROM police_stations WHERE station_id = ?', [id]);
    return rows[0] || null;
}

export async function createStation(data) {
    const { name, district, city, address, contact, email } = data;
    const [result] = await db.query(
        'INSERT INTO police_stations (station_name, district, city, address, contact_number, email) VALUES (?, ?, ?, ?, ?, ?)',
        [name, district, city, address, contact, email]
    );
    return findStationById(result.insertId);
}

export async function updateStationById(id, data) {
    const { name, district, city, address, contact, email } = data;
    await db.query(
        'UPDATE police_stations SET station_name = ?, district = ?, city = ?, address = ?, contact_number = ?, email = ? WHERE station_id = ?',
        [name, district, city, address, contact, email, id]
    );
    return findStationById(id);
}

export async function deleteStationById(id) {
    const [result] = await db.query('DELETE FROM police_stations WHERE station_id = ?', [id]);
    return result.affectedRows;
}

export async function stationHasOfficers(id) {
    const [rows] = await db.query('SELECT officer_id FROM officers WHERE station_id = ? LIMIT 1', [id]);
    return rows.length > 0;
}