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
