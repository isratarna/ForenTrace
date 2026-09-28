import express from 'express';
import {
    listFamilyMembers,
    getFamilyMembersByPerson,
    getFamilyMember,
    addFamilyMember,
    editFamilyMember,
    removeFamilyMember,
    registerDnaSampleFromFamily,
} from '../controllers/familyMemberController.js';

const router = express.Router();

// View all family members (supports ?person_id=1&search=...)
router.get('/', listFamilyMembers);

// View family members for a specific missing person
router.get('/person/:personId', getFamilyMembersByPerson);

// View single family member by family_id
router.get('/:id', getFamilyMember);

// Add family member
router.post('/', addFamilyMember);

// Edit family member
router.put('/:id', editFamilyMember);

// Remove family member
router.delete('/:id', removeFamilyMember);

// Register DNA sample from family member
router.post('/:id/register-dna', registerDnaSampleFromFamily);

export default router;