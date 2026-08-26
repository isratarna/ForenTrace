import {
  findAllCases,
  findCaseById,
  findMissingPersonById,
  findCaseStationById,
  findCaseOfficerById,
  caseExistsForPerson,
  createCase as dbCreateCase,
  updateCaseById as dbUpdateCase,
  deleteCaseById as dbDeleteCase,
} from '../models/caseModel.js'

const ALLOWED_CASE_STATUSES = ['Active', 'Pending', 'Solved']
const ALLOWED_PRIORITIES = ['High', 'Medium', 'Low']

function formatDate(value) {
  if (!value) return null
  if (typeof value === 'string') return value.slice(0, 10)

  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatCase(row) {
  if (!row) return null

  return {
    id: row.case_id,
    caseId: row.case_id,
    personId: row.person_id,
    stationId: row.station_id,
    officerId: row.officer_id,
    reportDate: formatDate(row.report_date),
    status: row.case_status,
    caseStatus: row.case_status,
    priority: row.priority,
    identifiedDate: formatDate(row.identified_date),
    notes: row.case_notes || '',
    caseNotes: row.case_notes || '',
  }
}

function parseId(value) {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) return null
  return id
}

function readField(body, ...names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(body, name)) {
      return { provided: true, value: body[name] }
    }
  }

  return { provided: false, value: undefined }
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeDate(value, required = false) {
  if (value === null || value === undefined || value === '') {
    return required ? undefined : null
  }

  if (typeof value !== 'string') return undefined

  const date = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined

  const parsed = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    return undefined
  }

  return date
}

function normalizeNotes(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') return undefined
  return value.trim() || null
}

async function validateReferences(personId, stationId, officerId, checkPerson = true) {
  if (checkPerson && !(await findMissingPersonById(personId))) {
    return { status: 404, message: 'Missing person not found.' }
  }

  if (!(await findCaseStationById(stationId))) {
    return { status: 404, message: 'Police station not found.' }
  }

  const officer = await findCaseOfficerById(officerId)
  if (!officer) {
    return { status: 404, message: 'Officer not found.' }
  }

  if (officer.station_id !== stationId) {
    return {
      status: 400,
      message: 'Officer does not belong to the selected police station.',
    }
  }

  return null
}

export async function listCases(req, res) {
  try {
    const cases = await findAllCases()

    return res.status(200).json({
      success: true,
      cases: cases.map(formatCase),
    })
  } catch (error) {
    console.error('List cases error:', error)
    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
    })
  }
}

export async function getCase(req, res) {
  try {
    const id = parseId(req.params.id)
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Invalid case id.',
      })
    }

    const caseFile = await findCaseById(id)
    if (!caseFile) {
      return res.status(404).json({
        success: false,
        message: 'Case not found.',
      })
    }

    return res.status(200).json({
      success: true,
      case: formatCase(caseFile),
    })
  } catch (error) {
    console.error('Get case error:', error)
    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
    })
  }
}

export async function createCase(req, res) {
  try {
    const body = req.body || {}
    const personId = parseId(readField(body, 'person_id', 'personId').value)
    const stationId = parseId(readField(body, 'station_id', 'stationId').value)
    const officerId = parseId(readField(body, 'officer_id', 'officerId').value)
    const reportDate = normalizeDate(
      readField(body, 'report_date', 'reportDate').value,
      true
    )
    const caseStatus = normalizeText(
      readField(body, 'case_status', 'caseStatus', 'status').value
    )
    const priority = normalizeText(readField(body, 'priority').value)
    const identifiedDate = normalizeDate(
      readField(body, 'identified_date', 'identifiedDate').value
    )
    const caseNotes = normalizeNotes(
      readField(body, 'case_notes', 'caseNotes', 'notes').value
    )

    if (!personId || !stationId || !officerId || !reportDate || !caseStatus || !priority) {
      return res.status(400).json({
        success: false,
        message: 'Person ID, station ID, officer ID, report date, case status, and priority are required.',
      })
    }

    if (!ALLOWED_CASE_STATUSES.includes(caseStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid case status.',
      })
    }

    if (!ALLOWED_PRIORITIES.includes(priority)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid priority.',
      })
    }

    if (identifiedDate === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Invalid identified date.',
      })
    }

    if (caseNotes === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Case notes must be text.',
      })
    }

    const referenceError = await validateReferences(
      personId,
      stationId,
      officerId
    )
    if (referenceError) {
      return res.status(referenceError.status).json({
        success: false,
        message: referenceError.message,
      })
    }

    if (await caseExistsForPerson(personId)) {
      return res.status(409).json({
        success: false,
        message: 'A case already exists for this missing person.',
      })
    }

    const caseFile = await dbCreateCase({
      personId,
      stationId,
      officerId,
      reportDate,
      caseStatus,
      priority,
      identifiedDate,
      caseNotes,
    })

    return res.status(201).json({
      success: true,
      message: 'Case created successfully.',
      case: formatCase(caseFile),
    })
  } catch (error) {
    console.error('Create case error:', error)

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'A case already exists for this missing person.',
      })
    }

    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
    })
  }
}

export async function updateCase(req, res) {
  try {
    const id = parseId(req.params.id)
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Invalid case id.',
      })
    }

    const existing = await findCaseById(id)
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Case not found.',
      })
    }

    const body = req.body || {}
    const stationField = readField(body, 'station_id', 'stationId')
    const officerField = readField(body, 'officer_id', 'officerId')
    const statusField = readField(body, 'case_status', 'caseStatus', 'status')
    const priorityField = readField(body, 'priority')
    const identifiedDateField = readField(body, 'identified_date', 'identifiedDate')
    const notesField = readField(body, 'case_notes', 'caseNotes', 'notes')

    if (!stationField.provided && !officerField.provided && !statusField.provided &&
      !priorityField.provided && !identifiedDateField.provided && !notesField.provided) {
      return res.status(400).json({
        success: false,
        message: 'At least one updatable case field is required.',
      })
    }

    const stationId = stationField.provided
      ? parseId(stationField.value)
      : existing.station_id
    const officerId = officerField.provided
      ? parseId(officerField.value)
      : existing.officer_id
    const caseStatus = statusField.provided
      ? normalizeText(statusField.value)
      : existing.case_status
    const priority = priorityField.provided
      ? normalizeText(priorityField.value)
      : existing.priority
    const identifiedDate = identifiedDateField.provided
      ? normalizeDate(identifiedDateField.value)
      : existing.identified_date
    const caseNotes = notesField.provided
      ? normalizeNotes(notesField.value)
      : existing.case_notes

    if (!stationId || !officerId) {
      return res.status(400).json({
        success: false,
        message: 'Valid station ID and officer ID are required.',
      })
    }

    if (!ALLOWED_CASE_STATUSES.includes(caseStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid case status.',
      })
    }

    if (!ALLOWED_PRIORITIES.includes(priority)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid priority.',
      })
    }

    if (identifiedDate === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Invalid identified date.',
      })
    }

    if (caseNotes === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Case notes must be text.',
      })
    }

    if (stationField.provided || officerField.provided) {
      const referenceError = await validateReferences(
        existing.person_id,
        stationId,
        officerId,
        false
      )
      if (referenceError) {
        return res.status(referenceError.status).json({
          success: false,
          message: referenceError.message,
        })
      }
    }

    const caseFile = await dbUpdateCase(id, {
      stationId,
      officerId,
      caseStatus,
      priority,
      identifiedDate,
      caseNotes,
    })

    return res.status(200).json({
      success: true,
      message: 'Case updated successfully.',
      case: formatCase(caseFile),
    })
  } catch (error) {
    console.error('Update case error:', error)
    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
    })
  }
}

export async function deleteCase(req, res) {
  try {
    const id = parseId(req.params.id)
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Invalid case id.',
      })
    }

    const existing = await findCaseById(id)
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Case not found.',
      })
    }

    await dbDeleteCase(id)

    return res.status(200).json({
      success: true,
      message: 'Case deleted successfully.',
    })
  } catch (error) {
    console.error('Delete case error:', error)
    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
    })
  }
}
