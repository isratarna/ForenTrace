import express from 'express';
import {
    listFamilyMembers,
    getFamilyMembersByPerson,
    getFamilyMember,
    addFamilyMember,
    editFamilyMember,
    removeFamilyMember,
} from '../controllers/familyMemberController.js';
// Family DNA registration ekhon DNA Sample module (Member 1 - Issue 2) handle kore — validation + auth shoho
import { registerFamilySample } from '../controllers/dnaSampleController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/roleMiddleware.js';

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

// Register DNA sample from family member (Member 1 - Issue 2)
// Login lagbe, shudhu Admin/Officer; person_id family record theke ashe, status 'Awaiting Analysis'
router.post('/:id/register-dna', requireAuth, requireRole('Admin', 'Officer'), registerFamilySample);

export default router;