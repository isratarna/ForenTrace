import express from 'express';
import * as dnaLabController from '../controllers/dnaLabController.js';
import * as authMiddleware from '../middleware/authMiddleware.js';
import * as roleMiddleware from '../middleware/roleMiddleware.js';

const router = express.Router();

// Fallback resolver for existing Auth & Role middlewares
const authGuard = authMiddleware.requireAuth ||
    authMiddleware.isAuthenticated ||
    authMiddleware.protect ||
    authMiddleware.verifyToken ||
    ((req, res, next) => next());

const adminGuard = roleMiddleware.requireAdmin ||
    roleMiddleware.isAdmin ||
    roleMiddleware.checkAdmin ||
    (roleMiddleware.authorizeRoles ? roleMiddleware.authorizeRoles('Admin') : ((req, res, next) => next()));

// Public / Authenticated read routes
router.get('/', dnaLabController.getLabs);
router.get('/:id', dnaLabController.getLabById);

// Admin write routes
router.post('/', authGuard, adminGuard, dnaLabController.createLab);
router.put('/:id', authGuard, adminGuard, dnaLabController.updateLab);
router.delete('/:id', authGuard, adminGuard, dnaLabController.deleteLab);

export default router;