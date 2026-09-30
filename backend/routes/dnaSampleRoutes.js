import express from 'express'

import {
  listSamples,
  getSample,
  createSample,
  updateSample,
  deleteSample,
  getFamilyDna,
  updateAnalysis,
  getLabSummary,
  getSampleOverviewReport,
} from '../controllers/dnaSampleController.js'
import { requireAuth } from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'

const router = express.Router()

// Missing person er family member + reference sample info (Issue 2)
// '/:id' er AGE rakhte hobe, noile 'family' ke id hishebe dhorbe
// Technician family er contact info dekhbe na, tai shudhu Admin + Officer
router.get('/family/:personId', requireAuth, requireRole('Admin', 'Officer'), getFamilyDna)

// Technician er nijer lab er workload summary (Issue 3) — eta o '/:id' er AGE
router.get('/lab/summary', requireAuth, requireRole('Lab Technician'), getLabSummary)

// UNION report: Matched + Awaiting Match sample (Issue 6) — tinjonei, role onujayi scoped — '/:id' er AGE
router.get('/report/overview', requireAuth, requireRole('Admin', 'Officer', 'Lab Technician'), getSampleOverviewReport)

// Admin, Officer, Lab Technician — tinjonei sample dekhte parbe (controller role onujayi data filter kore)
router.get('/',requireAuth, requireRole('Admin', 'Officer', 'Lab Technician'), listSamples)
router.get('/:id', requireAuth, requireRole('Admin', 'Officer', 'Lab Technician'), getSample)

// Shudhu Admin ar Officer sample register/update/delete korte parbe
router.post('/', requireAuth, requireRole('Admin', 'Officer'), createSample)
router.put('/:id', requireAuth, requireRole('Admin', 'Officer'), updateSample)
router.delete('/:id', requireAuth, requireRole('Admin', 'Officer'), deleteSample)

// Laboratory analysis update (Issue 3) — shudhu Lab Technician, shudhu analysis field
router.put('/:id/analysis', requireAuth, requireRole('Lab Technician'), updateAnalysis)

export default router
