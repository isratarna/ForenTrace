const PoliceStation = require('../models/policeStationModel').default || require('../models/policeStationModel');

// Get all stations
exports.getStations = async (req, res) => {
    try {
        const stations = await PoliceStation.getAll();
        res.status(200).json({ success: true, data: stations });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get station by ID
exports.getStationById = async (req, res) => {
    try {
        const station = await PoliceStation.getById(req.params.id);
        if (!station) {
            return res.status(404).json({ success: false, message: 'Police station not found' });
        }
        res.status(200).json({ success: true, data: station });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Create a station
exports.createStation = async (req, res) => {
    try {
        const { station_name, district, city, address, contact_number, email } = req.body;
        if (!station_name || !district || !city || !address || !contact_number || !email) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }
        const stationId = await PoliceStation.create(req.body);
        res.status(201).json({ success: true, message: 'Police station created successfully', stationId });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Update a station
exports.updateStation = async (req, res) => {
    try {
        const affectedRows = await PoliceStation.update(req.params.id, req.body);
        if (affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Police station not found or no changes made' });
        }
        res.status(200).json({ success: true, message: 'Police station updated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Delete a station
exports.deleteStation = async (req, res) => {
    try {
        const affectedRows = await PoliceStation.delete(req.params.id);
        if (affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Police station not found' });
        }
        res.status(200).json({ success: true, message: 'Police station deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};