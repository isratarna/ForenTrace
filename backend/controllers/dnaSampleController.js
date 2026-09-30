import {
  findAllSamples,
  findSampleById,
  createSample as dbCreateSample,
  updateSampleById as dbUpdateSample,
  deleteSampleById as dbDeleteSample,
  findPersonForSample,
  familyMemberBelongsToPerson,
  findLabForSample,
  technicianBelongsToLab,
  officerAssignedToPerson,
  findFamilyMemberForSample,
  createFamilySample as dbCreateFamilySample,
  findFamilyDnaByPerson,
  findFamilyDnaSummary,
  findTechnicianForUser,
  findLabSampleSummary,
  updateSampleAnalysis as dbUpdateSampleAnalysis,
  findSampleOverviewReport,
} from '../models/dnaSampleModel.js'

// Sample er allowed status gulo (filter validate korar jonno)
export const SAMPLE_STATUSES = ['Awaiting Analysis', 'In Analysis', 'Analyzed', 'Rejected']

// Database er DATE ke frontend er YYYY-MM-DD format e convert kore
function formatDate(value) {
  if (!value) return null
  if (typeof value === 'string') return value.slice(0, 10)

  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Database row ke API response object e convert kore (camelCase + snake_case dutoi rakha holo
// jate purono component gulo (SamplesTable) o kaj kore)
export function formatSample(row) {
  if (!row) return null

  return {
    id: row.sample_id,
    sampleId: row.sample_id,
    sample_id: row.sample_id,
    personId: row.person_id,
    person_id: row.person_id,
    personName: row.person_name,
    personStatus: row.person_status,
    familyId: row.family_id,
    family_id: row.family_id,
    familyMemberName: row.family_member_name || null,
    familyRelationship: row.family_relationship || null,
    source: row.family_id ? 'Family Reference' : 'Missing Person / Evidence', // family_id thakle reference sample
    labId: row.lab_id,
    lab_id: row.lab_id,
    labName: row.lab_name || null,
    technicianId: row.technician_id,
    technician_id: row.technician_id,
    technicianName: row.technician_name || null,
    caseId: row.case_id ?? null,
    case_id: row.case_id ?? null,
    sampleType: row.sample_type,
    sample_type: row.sample_type,
    collectionDate: formatDate(row.collection_date),
    collection_date: formatDate(row.collection_date),
    storageLocation: row.storage_location || '',
    storage_location: row.storage_location || '',
    remarks: row.remarks || '',
    analysisDate: formatDate(row.analysis_date),
    analysis_date: formatDate(row.analysis_date),
    dnaProfileCode: row.dna_profile_code || null,
    dna_profile_code: row.dna_profile_code || null,
    status: row.status,
  }
}

// URL/body theke asha id valid positive integer kina check kore
function parseId(value) {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) return null
  return id
}

// Request body theke snake_case ba camelCase — je kono naam er field pora
function readField(body, ...names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(body, name)) {
      return { provided: true, value: body[name] }
    }
  }

  return { provided: false, value: undefined }
}

// Text trim kore, text na hole empty string dey
function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

// Optional text: faka hole null, text na hole undefined (invalid)
function normalizeOptionalText(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') return undefined
  return value.trim() || null
}

// Optional id: faka hole null, invalid hole undefined
function normalizeOptionalId(value) {
  if (value === null || value === undefined || value === '') return null
  return parseId(value) ?? undefined
}

// Date ta real kina ebong YYYY-MM-DD format e ache kina check
function normalizeDate(value) {
  if (typeof value !== 'string') return undefined

  const date = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined

  const parsed = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    return undefined
  }

  return date
}

// Body theke sample er collection fields pore validate kore — error thakle { error } return
function readSampleBody(body) {
  const personId = parseId(readField(body, 'person_id', 'personId').value)
  const familyId = normalizeOptionalId(readField(body, 'family_id', 'familyId').value)
  const labId = parseId(readField(body, 'lab_id', 'labId').value)
  const technicianId = normalizeOptionalId(readField(body, 'technician_id', 'technicianId').value)
  const sampleType = normalizeText(readField(body, 'sample_type', 'sampleType').value)
  const collectionDate = normalizeDate(readField(body, 'collection_date', 'collectionDate').value)
  const storageLocation = normalizeOptionalText(readField(body, 'storage_location', 'storageLocation').value)
  const remarks = normalizeOptionalText(readField(body, 'remarks').value)

  if (!personId || !labId || !sampleType) {
    return { error: 'Person ID, lab ID, sample type, and collection date are required.' }
  }

  if (familyId === undefined || technicianId === undefined) {
    return { error: 'Invalid family member or technician id.' }
  }

  if (!collectionDate) {
    return { error: 'Invalid collection date.' }
  }

  // Bhobishhot er collection date grohonjoggo na
  const today = formatDate(new Date())
  if (collectionDate > today) {
    return { error: 'Collection date cannot be in the future.' }
  }

  if (sampleType.length > 100 || (storageLocation && storageLocation.length > 150)) {
    return { error: 'Sample type or storage location is too long.' }
  }

  if (storageLocation === undefined || remarks === undefined) {
    return { error: 'Storage location and remarks must be text.' }
  }

  return {
    values: { personId, familyId, labId, technicianId, sampleType, collectionDate, storageLocation, remarks },
  }
}

// Related record gulo ache kina ebong eke oporer sathe mile kina check kore
async function validateReferences({ personId, familyId, labId, technicianId }, user) {
  if (!(await findPersonForSample(personId))) {
    return { status: 404, message: 'Missing person not found.' }
  }

  if (familyId && !(await familyMemberBelongsToPerson(familyId, personId))) {
    return { status: 400, message: 'Family member does not belong to the selected missing person.' }
  }

  if (!(await findLabForSample(labId))) {
    return { status: 404, message: 'DNA lab not found.' }
  }

  if (technicianId && !(await technicianBelongsToLab(technicianId, labId))) {
    return { status: 400, message: 'Technician does not belong to the selected DNA lab.' }
  }

  // Officer shudhu nijer assigned case er missing person er sample register/update korte parbe
  if (user.role === 'Officer' && !(await officerAssignedToPerson(user.officerId, personId))) {
    return { status: 403, message: 'You can only manage samples for your assigned cases.' }
  }

  return null
}

// GET /api/dna-samples — role onujayi scoped sample list
export async function listSamples(req, res) {
  try {
    const search = req.query.search?.trim() || req.query.q?.trim() || ''
    const status = req.query.status?.trim() || ''

    if (status && !SAMPLE_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid sample status filter.' })
    }

    const samples = await findAllSamples(
      {
        search: search || undefined,
        status: status || undefined,
        personId: parseId(req.query.person_id ?? req.query.personId) || undefined,
        familyId: parseId(req.query.family_id ?? req.query.familyId) || undefined,
        labId: parseId(req.query.lab_id ?? req.query.labId) || undefined,
        caseId: parseId(req.query.case_id ?? req.query.caseId) || undefined,
      },
      req.session.user // logged-in user er role diye scope hobe
    )

    return res.status(200).json({
      success: true,
      samples: samples.map(formatSample),
    })
  } catch (error) {
    console.error('List DNA samples error:', error)
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}

// GET /api/dna-samples/:id — ekta sample er details
export async function getSample(req, res) {
  try {
    const id = parseId(req.params.id)
    if (!id) {
      return res.status(400).json({ success: false, message: 'Invalid sample id.' })
    }

    // Scope er baire hole null ashbe → 404 (onno lab/case er sample ache kina o janano hobe na)
    const sample = await findSampleById(id, req.session.user)
    if (!sample) {
      return res.status(404).json({ success: false, message: 'DNA sample not found.' })
    }

    return res.status(200).json({ success: true, sample: formatSample(sample) })
  } catch (error) {
    console.error('Get DNA sample error:', error)
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}

// POST /api/dna-samples — notun DNA sample register
export async function createSample(req, res) {
  try {
    const { values, error } = readSampleBody(req.body || {})
    if (error) {
      return res.status(400).json({ success: false, message: error })
    }

    const referenceError = await validateReferences(values, req.session.user)
    if (referenceError) {
      return res.status(referenceError.status).json({ success: false, message: referenceError.message })
    }

    const sample = await dbCreateSample(values)

    return res.status(201).json({
      success: true,
      message: 'DNA sample registered successfully.',
      sample: formatSample(sample),
    })
  } catch (error) {
    console.error('Create DNA sample error:', error)
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}

// PUT /api/dna-samples/:id — sample er collection info update
export async function updateSample(req, res) {
  try {
    const id = parseId(req.params.id)
    if (!id) {
      return res.status(400).json({ success: false, message: 'Invalid sample id.' })
    }

    // Age dekhi user er ei sample access ache kina
    const existing = await findSampleById(id, req.session.user)
    if (!existing) {
      return res.status(404).json({ success: false, message: 'DNA sample not found.' })
    }

    // Body te je field deya hoyni sheta existing value theke nibo (partial update support)
    const body = req.body || {}
    const merged = {
      person_id: existing.person_id,
      family_id: existing.family_id,
      lab_id: existing.lab_id,
      technician_id: existing.technician_id,
      sample_type: existing.sample_type,
      collection_date: formatDate(existing.collection_date),
      storage_location: existing.storage_location,
      remarks: existing.remarks,
    }
    const fieldNames = {
      person_id: ['person_id', 'personId'],
      family_id: ['family_id', 'familyId'],
      lab_id: ['lab_id', 'labId'],
      technician_id: ['technician_id', 'technicianId'],
      sample_type: ['sample_type', 'sampleType'],
      collection_date: ['collection_date', 'collectionDate'],
      storage_location: ['storage_location', 'storageLocation'],
      remarks: ['remarks'],
    }
    for (const [key, names] of Object.entries(fieldNames)) {
      const field = readField(body, ...names)
      if (field.provided) merged[key] = field.value
    }

    const { values, error } = readSampleBody(merged)
    if (error) {
      return res.status(400).json({ success: false, message: error })
    }

    const referenceError = await validateReferences(values, req.session.user)
    if (referenceError) {
      return res.status(referenceError.status).json({ success: false, message: referenceError.message })
    }

    const sample = await dbUpdateSample(id, values)

    return res.status(200).json({
      success: true,
      message: 'DNA sample updated successfully.',
      sample: formatSample(sample),
    })
  } catch (error) {
    console.error('Update DNA sample error:', error)
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}

// DELETE /api/dna-samples/:id — sample delete
export async function deleteSample(req, res) {
  try {
    const id = parseId(req.params.id)
    if (!id) {
      return res.status(400).json({ success: false, message: 'Invalid sample id.' })
    }

    const existing = await findSampleById(id, req.session.user)
    if (!existing) {
      return res.status(404).json({ success: false, message: 'DNA sample not found.' })
    }

    await dbDeleteSample(id)

    return res.status(200).json({ success: true, message: 'DNA sample deleted successfully.' })
  } catch (error) {
    console.error('Delete DNA sample error:', error)
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}

// ---------- Family DNA Reference Integration (Member 1 - Issue 2) ----------

// POST /api/family-members/:id/register-dna — family member theke reference DNA sample register
// person_id ar family_id body theke na niye family member record theke neya hoy (vul link hobe na)
export async function registerFamilySample(req, res) {
  try {
    const familyId = parseId(req.params.id)
    if (!familyId) {
      return res.status(400).json({ success: false, message: 'Invalid family member id.' })
    }

    const member = await findFamilyMemberForSample(familyId)
    if (!member) {
      return res.status(404).json({ success: false, message: 'Family member not found.' })
    }

    // Body er baki field (lab, technician, type, date...) nibo, kintu person/family jor kore family record theke
    const { values, error } = readSampleBody({
      ...(req.body || {}),
      person_id: member.person_id,
      family_id: member.family_id,
    })
    if (error) {
      return res.status(400).json({ success: false, message: error })
    }

    // Lab/technician valid kina + Officer hole tar assigned case kina check
    const referenceError = await validateReferences(values, req.session.user)
    if (referenceError) {
      return res.status(referenceError.status).json({ success: false, message: referenceError.message })
    }

    const sample = await dbCreateFamilySample(familyId, values)

    return res.status(201).json({
      success: true,
      message: `Reference DNA sample registered for ${member.first_name} ${member.last_name}.`,
      sample: formatSample(sample),
    })
  } catch (error) {
    console.error('Register family DNA sample error:', error)
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}

// GET /api/dna-samples/family/:personId — missing person details page er family DNA info
export async function getFamilyDna(req, res) {
  try {
    const personId = parseId(req.params.personId)
    if (!personId) {
      return res.status(400).json({ success: false, message: 'Invalid person id.' })
    }

    if (!(await findPersonForSample(personId))) {
      return res.status(404).json({ success: false, message: 'Missing person not found.' })
    }

    // Officer shudhu nijer assigned case er family DNA info dekhte parbe
    const user = req.session.user
    if (user.role === 'Officer' && !(await officerAssignedToPerson(user.officerId, personId))) {
      return res.status(403).json({ success: false, message: 'You can only view family DNA for your assigned cases.' })
    }

    const [rows, summary] = await Promise.all([
      findFamilyDnaByPerson(personId),
      findFamilyDnaSummary(personId),
    ])

    // LEFT JOIN er flat row gulo ke family member onujayi group kora (ek member er onek sample thakte pare)
    const members = new Map()
    for (const row of rows) {
      if (!members.has(row.family_id)) {
        members.set(row.family_id, {
          familyId: row.family_id,
          name: row.family_member_name,
          relationship: row.relationship,
          phone: row.phone,
          samples: [],
        })
      }

      if (row.sample_id) { // sample_id NULL mane ei member er ekhono kono sample nai
        members.get(row.family_id).samples.push({
          sampleId: row.sample_id,
          sampleType: row.sample_type,
          collectionDate: formatDate(row.collection_date),
          status: row.sample_status,
          analysisDate: formatDate(row.analysis_date),
          dnaProfileCode: row.dna_profile_code || null,
          labName: row.lab_name || null,
        })
      }
    }

    return res.status(200).json({
      success: true,
      summary: {
        totalFamilyMembers: Number(summary.total_family_members),
        membersWithSample: Number(summary.members_with_sample),
        totalReferenceSamples: Number(summary.total_reference_samples),
        analyzedReferenceSamples: Number(summary.analyzed_reference_samples || 0), // SUM NULL hole 0
      },
      familyMembers: [...members.values()],
    })
  } catch (error) {
    console.error('Get family DNA error:', error)
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}

// ---------- Laboratory DNA Analysis Workflow (Member 1 - Issue 3) ----------

// Ei field gulo investigation info — technician egulo pathale request reject hobe
const INVESTIGATION_FIELDS = [
  'person_id', 'personId', 'family_id', 'familyId', 'lab_id', 'labId',
  'technician_id', 'technicianId', 'sample_type', 'sampleType',
  'collection_date', 'collectionDate', 'storage_location', 'storageLocation',
]

// DNA profile code format: boro hater letter, number ar hyphen, 6-50 character (jemon DNA7F2A91C4)
const PROFILE_CODE_PATTERN = /^[A-Z0-9-]{6,50}$/

// PUT /api/dna-samples/:id/analysis — technician er analysis update
export async function updateAnalysis(req, res) {
  try {
    const id = parseId(req.params.id)
    if (!id) {
      return res.status(400).json({ success: false, message: 'Invalid sample id.' })
    }

    // Technician investigation info change korte parbe na — egulo pathale shorashori reject
    const body = req.body || {}
    const forbidden = INVESTIGATION_FIELDS.filter(name => Object.prototype.hasOwnProperty.call(body, name))
    if (forbidden.length) {
      return res.status(400).json({
        success: false,
        message: 'Lab technicians can only update analysis fields (DNA profile code, analysis date, remarks, status).',
      })
    }

    // Logged-in user er technician profile na thakle kon lab er sample ta bojha jabe na
    const technician = await findTechnicianForUser(req.session.user)
    if (!technician) {
      return res.status(403).json({ success: false, message: 'No technician profile is linked to this account.' })
    }

    // Scope shoho sample load — onno lab er sample hole 404
    const existing = await findSampleById(id, req.session.user)
    if (!existing) {
      return res.status(404).json({ success: false, message: 'DNA sample not found.' })
    }

    // Partial update: je field pathano hoyni sheta existing value theke
    const statusField = readField(body, 'status')
    const profileField = readField(body, 'dna_profile_code', 'dnaProfileCode')
    const dateField = readField(body, 'analysis_date', 'analysisDate')
    const remarksField = readField(body, 'remarks')

    const status = statusField.provided ? normalizeText(statusField.value) : existing.status
    const rawProfile = profileField.provided ? profileField.value : existing.dna_profile_code
    const dnaProfileCode = typeof rawProfile === 'string' && rawProfile.trim() ? rawProfile.trim().toUpperCase() : null // uppercase e store
    const rawDate = dateField.provided ? dateField.value : formatDate(existing.analysis_date)
    const analysisDate = rawDate ? normalizeDate(rawDate) : null
    const remarks = remarksField.provided ? normalizeOptionalText(remarksField.value) : existing.remarks

    if (!SAMPLE_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid analysis status.' })
    }

    if (profileField.provided && profileField.value !== null && typeof profileField.value !== 'string') {
      return res.status(400).json({ success: false, message: 'DNA profile code must be text.' })
    }

    if (dnaProfileCode && !PROFILE_CODE_PATTERN.test(dnaProfileCode)) {
      return res.status(400).json({
        success: false,
        message: 'DNA profile code must be 6-50 characters using letters, numbers, or hyphens.',
      })
    }

    if (analysisDate === undefined) {
      return res.status(400).json({ success: false, message: 'Invalid analysis date.' })
    }

    if (remarks === undefined) {
      return res.status(400).json({ success: false, message: 'Remarks must be text.' })
    }

    // Analysis date collection date er age ba bhobishhote hote parbe na
    if (analysisDate) {
      if (analysisDate > formatDate(new Date())) {
        return res.status(400).json({ success: false, message: 'Analysis date cannot be in the future.' })
      }
      if (analysisDate < formatDate(existing.collection_date)) {
        return res.status(400).json({ success: false, message: 'Analysis date cannot be before the collection date.' })
      }
    }

    // Status onujayi rule:
    // Analyzed hole profile code + analysis date lagbe, Rejected hole karon (remarks) lagbe
    if (status === 'Analyzed' && (!dnaProfileCode || !analysisDate)) {
      return res.status(400).json({
        success: false,
        message: 'DNA profile code and analysis date are required to mark a sample as Analyzed.',
      })
    }

    if (status === 'Rejected' && !remarks) {
      return res.status(400).json({ success: false, message: 'Remarks are required when rejecting a sample.' })
    }

    const sample = await dbUpdateSampleAnalysis(id, technician.lab_id, technician.technician_id, {
      dnaProfileCode,
      analysisDate,
      remarks,
      status,
    })

    if (!sample) {
      return res.status(404).json({ success: false, message: 'DNA sample not found.' })
    }

    return res.status(200).json({
      success: true,
      message: 'DNA analysis updated successfully.',
      sample: formatSample(sample),
    })
  } catch (error) {
    console.error('Update DNA analysis error:', error)
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}

// GET /api/dna-samples/lab/summary — technician er lab er workload count
export async function getLabSummary(req, res) {
  try {
    const technician = await findTechnicianForUser(req.session.user)
    if (!technician) {
      return res.status(403).json({ success: false, message: 'No technician profile is linked to this account.' })
    }

    const summary = await findLabSampleSummary(technician.lab_id)

    // SUM() string/NULL ashe, tai Number e convert
    return res.status(200).json({
      success: true,
      summary: {
        labId: summary.lab_id,
        labName: summary.lab_name,
        totalSamples: Number(summary.total_samples),
        awaitingAnalysis: Number(summary.awaiting_analysis || 0),
        inAnalysis: Number(summary.in_analysis || 0),
        analyzed: Number(summary.analyzed || 0),
        rejected: Number(summary.rejected || 0),
      },
    })
  } catch (error) {
    console.error('Get lab summary error:', error)
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}

// ---------- SQL UNION Report — DNA Sample Overview (Member 1 - Issue 6) ----------

// GET /api/dna-samples/report/overview — Matched + Awaiting Match sample (UNION), role onujayi scoped
export async function getSampleOverviewReport(req, res) {
  try {
    const rows = await findSampleOverviewReport(req.session.user)

    const report = rows.map(row => ({
      sampleId: row.sample_id,
      personName: row.person_name,
      source: row.source,
      sampleType: row.sample_type,
      labName: row.lab_name || null,
      dnaProfileCode: row.dna_profile_code,
      reportStatus: row.report_status, // 'Matched' ba 'Awaiting Match'
      confirmedMatchId: row.confirmed_match_id ?? null,
      pendingReviewMatches: Number(row.pending_review_matches), // COUNT() string/bigint ashe
    }))

    // Report card er jonno duita group er count
    const matched = report.filter(item => item.reportStatus === 'Matched').length

    return res.status(200).json({
      success: true,
      summary: {
        matched,
        awaitingMatch: report.length - matched,
        total: report.length,
      },
      report,
    })
  } catch (error) {
    console.error('DNA sample overview report error:', error)
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}
