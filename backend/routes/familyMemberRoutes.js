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

// Family member records are available to Admins and Officers.
router.get('/', requireAuth, requireRole('Admin', 'Officer'), listFamilyMembers);

router.get('/person/:personId', requireAuth, requireRole('Admin', 'Officer'), getFamilyMembersByPerson);

router.get('/:id', requireAuth, requireRole('Admin', 'Officer'), getFamilyMember);

router.post('/', requireAuth, requireRole('Admin', 'Officer'), addFamilyMember);

router.put('/:id', requireAuth, requireRole('Admin', 'Officer'), editFamilyMember);

router.delete('/:id', requireAuth, requireRole('Admin', 'Officer'), removeFamilyMember);

// Register DNA sample from family member (Member 1 - Issue 2)
// Login lagbe, shudhu Admin/Officer; person_id family record theke ashe, status 'Awaiting Analysis'
router.post('/:id/register-dna', requireAuth, requireRole('Admin', 'Officer'), registerFamilySample);

export default router;