const db = require('../config/db'); // Apnar database connection file

const PoliceStation = {
    getAll: async () => {
        const [rows] = await db.query('SELECT * FROM police_stations');
        return rows;
    },

    getById: async (id) => {
        const [rows] = await db.query('SELECT * FROM police_stations WHERE station_id = ?', [id]);
        return rows[0];
    },

    create: async (data) => {
        const { station_name, district, city, address, contact_number, email } = data;
        const [result] = await db.query(
            'INSERT INTO police_stations (station_name, district, city, address, contact_number, email) VALUES (?, ?, ?, ?, ?, ?)',
            [station_name, district, city, address, contact_number, email]
        );
        return result.insertId;
    },

    update: async (id, data) => {
        const { station_name, district, city, address, contact_number, email } = data;
        const [result] = await db.query(
            'UPDATE police_stations SET station_name = ?, district = ?, city = ?, address = ?, contact_number = ?, email = ? WHERE station_id = ?',
            [station_name, district, city, address, contact_number, email, id]
        );
        return result.affectedRows;
    },

    delete: async (id) => {
        const [result] = await db.query('DELETE FROM police_stations WHERE station_id = ?', [id]);
        return result.affectedRows;
    }
};

module.exports = PoliceStation;