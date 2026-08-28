import * as labTechnicianModel from '../models/labTechnicianModel.js';
import * as dnaLabModel from '../models/dnaLabModel.js';

// GET /api/technicians
export const getTechnicians = async (req, res) => {
    try {
        const technicians = await labTechnicianModel.getAllTechnicians();
        res.status(200).json({ success: true, data: technicians });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// GET /api/technicians/:id
export const getTechnicianById = async (req, res) => {
    try {
        const tech = await labTechnicianModel.getTechnicianById(req.params.id);
        if (!tech) {
            return res.status(404).json({ success: false, message: 'Technician not found' });
        }
        res.status(200).json({ success: true, data: tech });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// POST /api/technicians
export const createTechnician = async (req, res) => {
    try {
        const { lab_id, first_name, last_name, designation, phone, email } = req.body;

        if (!lab_id || !first_name || !last_name || !designation || !phone || !email) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }

        const labExists = await dnaLabModel.getLabById(lab_id);
        if (!labExists) {
            return res.status(400).json({ success: false, message: 'Selected DNA Lab does not exist' });
        }

        const emailConflict = await labTechnicianModel.getTechnicianByEmail(email);
        if (emailConflict) {
            return res.status(400).json({ success: false, message: 'Email already in use' });
        }

        const technicianId = await labTechnicianModel.createTechnician({
            lab_id,
            first_name,
            last_name,
            designation,
            phone,
            email
        });

        res.status(201).json({ success: true, message: 'Technician created successfully', technicianId });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// PUT /api/technicians/:id
export const updateTechnician = async (req, res) => {
    try {
        const { id } = req.params;
        const { lab_id, first_name, last_name, designation, phone, email } = req.body;

        if (!lab_id || !first_name || !last_name || !designation || !phone || !email) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }

        const tech = await labTechnicianModel.getTechnicianById(id);
        if (!tech) {
            return res.status(404).json({ success: false, message: 'Technician not found' });
        }

        const labExists = await dnaLabModel.getLabById(lab_id);
        if (!labExists) {
            return res.status(400).json({ success: false, message: 'Selected DNA Lab does not exist' });
        }

        const emailConflict = await labTechnicianModel.getTechnicianByEmail(email);
        if (emailConflict && emailConflict.technician_id !== parseInt(id, 10)) {
            return res.status(400).json({ success: false, message: 'Email already in use by another technician' });
        }

        await labTechnicianModel.updateTechnician(id, {
            lab_id,
            first_name,
            last_name,
            designation,
            phone,
            email
        });

        res.status(200).json({ success: true, message: 'Technician updated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// DELETE /api/technicians/:id
export const deleteTechnician = async (req, res) => {
    try {
        const { id } = req.params;
        const tech = await labTechnicianModel.getTechnicianById(id);
        if (!tech) {
            return res.status(404).json({ success: false, message: 'Technician not found' });
        }

        await labTechnicianModel.deleteTechnician(id);
        res.status(200).json({ success: true, message: 'Technician deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};