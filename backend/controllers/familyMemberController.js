import {
    findAllFamilyMembers,
    findFamilyMembersByPersonId,
    findFamilyMemberById,
    createFamilyMember,
    updateFamilyMemberById,
    deleteFamilyMemberById,
} from '../models/familyMemberModel.js';

export async function listFamilyMembers(req, res) {
    try {
        const { person_id, search } = req.query;
        const members = await findAllFamilyMembers({ person_id, search });
        res.status(200).json(members);
    } catch (error) {
        console.error('Error fetching family members:', error);
        res.status(500).json({ message: 'Failed to fetch family members', error: error.message });
    }
}

export async function getFamilyMembersByPerson(req, res) {
    try {
        const { personId } = req.params;
        const members = await findFamilyMembersByPersonId(personId);
        res.status(200).json(members);
    } catch (error) {
        console.error('Error fetching family members by person:', error);
        res.status(500).json({ message: 'Failed to fetch family members for missing person', error: error.message });
    }
}

export async function getFamilyMember(req, res) {
    try {
        const member = await findFamilyMemberById(req.params.id);
        if (!member) {
            return res.status(404).json({ message: 'Family member not found' });
        }
        res.status(200).json(member);
    } catch (error) {
        console.error('Error fetching family member:', error);
        res.status(500).json({ message: 'Failed to fetch family member', error: error.message });
    }
}

export async function addFamilyMember(req, res) {
    try {
        const { person_id, first_name, last_name, relationship, phone } = req.body;

        if (!person_id || !first_name || !last_name || !relationship || !phone) {
            return res.status(400).json({
                message: 'person_id, first_name, last_name, relationship, and phone are required',
            });
        }

        const created = await createFamilyMember(req.body);
        res.status(201).json(created);
    } catch (error) {
        console.error('Error creating family member:', error);
        res.status(500).json({ message: 'Failed to create family member', error: error.message });
    }
}

export async function editFamilyMember(req, res) {
    try {
        const { id } = req.params;
        const existing = await findFamilyMemberById(id);

        if (!existing) {
            return res.status(404).json({ message: 'Family member not found' });
        }

        const updated = await updateFamilyMemberById(id, {
            ...existing,
            ...req.body,
        });
        res.status(200).json(updated);
    } catch (error) {
        console.error('Error updating family member:', error);
        res.status(500).json({ message: 'Failed to update family member', error: error.message });
    }
}

export async function removeFamilyMember(req, res) {
    try {
        const { id } = req.params;
        const affected = await deleteFamilyMemberById(id);

        if (!affected) {
            return res.status(404).json({ message: 'Family member not found' });
        }

        res.status(200).json({ message: 'Family member removed successfully' });
    } catch (error) {
        console.error('Error deleting family member:', error);
        res.status(500).json({ message: 'Failed to delete family member', error: error.message });
    }
}

// Family DNA sample registration dnaSampleController.registerFamilySample e move kora hoyeche (Member 1 - Issue 2)