import * as dnaLabModel from '../models/dnaLabModel.js';

// GET /api/labs
export const getLabs = async (req, res) => {
    try {
        const labs = await dnaLabModel.getAllLabs();
        res.status(200).json({ success: true, data: labs });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// GET /api/labs/:id
export const getLabById = async (req, res) => {
    try {
        const lab = await dnaLabModel.getLabById(req.params.id);
        if (!lab) {
            return res.status(404).json({ success: false, message: 'DNA Lab not found' });
        }
        res.status(200).json({ success: true, data: lab });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// POST /api/labs
export const createLab = async (req, res) => {
    try {
        const { lab_name, city, address, contact_number, email } = req.body;

        if (!lab_name || !city || !address || !contact_number || !email) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }

        const existingLab = await dnaLabModel.getLabByEmail(email);
        if (existingLab) {
            return res.status(400).json({ success: false, message: 'Lab with this email already exists' });
        }

        const labId = await dnaLabModel.createLab({ lab_name, city, address, contact_number, email });
        res.status(201).json({ success: true, message: 'DNA Lab created successfully', labId });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// PUT /api/labs/:id
export const updateLab = async (req, res) => {
    try {
        const { id } = req.params;
        const { lab_name, city, address, contact_number, email } = req.body;

        if (!lab_name || !city || !address || !contact_number || !email) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }

        const existingLab = await dnaLabModel.getLabById(id);
        if (!existingLab) {
            return res.status(404).json({ success: false, message: 'DNA Lab not found' });
        }

        const emailConflict = await dnaLabModel.getLabByEmail(email);
        if (emailConflict && emailConflict.lab_id !== parseInt(id, 10)) {
            return res.status(400).json({ success: false, message: 'Email already used by another lab' });
        }

        await dnaLabModel.updateLab(id, { lab_name, city, address, contact_number, email });
        res.status(200).json({ success: true, message: 'DNA Lab updated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// DELETE /api/labs/:id
export const deleteLab = async (req, res) => {
    try {
        const { id } = req.params;

        const existingLab = await dnaLabModel.getLabById(id);
        if (!existingLab) {
            return res.status(404).json({ success: false, message: 'DNA Lab not found' });
        }

        const techCount = await dnaLabModel.getTechnicianCountByLabId(id);
        if (techCount > 0) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete DNA Lab with assigned technicians. Reassign or remove technicians first.'
            });
        }

        await dnaLabModel.deleteLab(id);
        res.status(200).json({ success: true, message: 'DNA Lab deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};