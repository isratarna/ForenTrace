import {
  findAllMissingPersons,
  findMissingPersonById,
  findMissingPersonStatistics,
  findMissingPersonsFromAboveAverageCities,
  createMissingPerson as dbCreateMissingPerson,
  updateMissingPersonById as dbUpdateMissingPerson,
  deleteMissingPersonById as dbDeleteMissingPerson,
  missingPersonHasCases,
  nationalIdExists,
} from '../models/missingPersonModel.js'

function formatDate(dateVal) {
  if (!dateVal) return ''
  if (dateVal instanceof Date) {
    return dateVal.toISOString().split('T')[0]
  }
  return String(dateVal).split('T')[0]
}

export function formatMissingPerson(row) {
  if (!row) return null

  return {
    id: row.person_id,
    personId: row.person_id,
    person_id: row.person_id,
    firstName: row.first_name,
    first_name: row.first_name,
    lastName: row.last_name,
    last_name: row.last_name,
    name: `${row.first_name} ${row.last_name}`.trim(),
    gender: row.gender || '',
    dob: formatDate(row.date_of_birth),
    date_of_birth: formatDate(row.date_of_birth),
    nationalId: row.national_id || '',
    national_id: row.national_id || '',
    bloodGroup: row.blood_group || '',
    blood_group: row.blood_group || '',
    height: row.height !== null ? Number(row.height) : null,
    weight: row.weight !== null ? Number(row.weight) : null,
    eyeColor: row.eye_color || '',
    eye_color: row.eye_color || '',
    hairColor: row.hair_color || '',
    hair_color: row.hair_color || '',
    photo: row.photo || '',
    missingDate: formatDate(row.missing_date),
    missing_date: formatDate(row.missing_date),
    location: row.last_seen_location || '',
    last_seen_location: row.last_seen_location || '',
    city: row.city || '',
    description: row.description || '',
    status: row.status,
    caseId: row.case_id ?? null,
    hasCase: Boolean(row.has_case),
  }
}

function parsePersonId(value) {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) return null
  return id
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

function textValue(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function isValidPhotoUrl(value) {
  if (!value) return true
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

const VALID_GENDERS = new Set(['Male', 'Female', 'Other'])
const VALID_STATUSES = new Set(['Missing', 'Identified'])

export async function listMissingPersons(req, res) {
  try {
    const search = req.query.search?.trim() || req.query.q?.trim() || ''
    const status = req.query.status?.trim() || ''
    const gender = req.query.gender?.trim() || ''
    const city = req.query.city?.trim() || ''
    const missingDate = req.query.missingDate?.trim() || req.query.missing_date?.trim() || ''
    const missingDateFrom = req.query.from?.trim() || req.query.missingDateFrom?.trim() || ''
    const missingDateTo = req.query.to?.trim() || req.query.missingDateTo?.trim() || ''

    if ((missingDate && !isValidDate(missingDate)) || (missingDateFrom && !isValidDate(missingDateFrom)) || (missingDateTo && !isValidDate(missingDateTo))) {
      return res.status(400).json({ success: false, message: 'Invalid missing date filter.' })
    }

    if (missingDateFrom && missingDateTo && missingDateFrom > missingDateTo) {
      return res.status(400).json({ success: false, message: 'Missing date range is invalid.' })
    }

    const persons = await findAllMissingPersons({
      search,
      status: status || undefined,
      gender: gender || undefined,
      city: city || undefined,
      missingDate: missingDate || undefined,
      missingDateFrom: missingDateFrom || undefined,
      missingDateTo: missingDateTo || undefined,
    })

    return res.status(200).json({
      success: true,
      missingPersons: persons.map(formatMissingPerson),
    })
  } catch (error) {
    console.error('List missing persons error:', error)
    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
    })
  }
}

export async function getMissingPersonStatistics(req, res) {
  try {
    const statistics = await findMissingPersonStatistics()
    return res.status(200).json({ success: true, ...statistics })
  } catch (error) {
    console.error('Missing person statistics error:', error)
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}

export async function getAboveAverageCityMissingPersons(req, res) {
  try {
    const persons = await findMissingPersonsFromAboveAverageCities()
    return res.status(200).json({ success: true, missingPersons: persons.map(formatMissingPerson) })
  } catch (error) {
    console.error('Above-average city query error:', error)
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}

export async function getMissingPerson(req, res) {
  try {
    const id = parsePersonId(req.params.id)
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Invalid person id.',
      })
    }

    const person = await findMissingPersonById(id)
    if (!person) {
      return res.status(404).json({
        success: false,
        message: 'Missing person not found.',
      })
    }

    return res.status(200).json({
      success: true,
      missingPerson: formatMissingPerson(person),
    })
  } catch (error) {
    console.error('Get missing person error:', error)
    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
    })
  }
}

export async function createMissingPerson(req, res) {
  try {
    const firstName = textValue(req.body.firstName) || textValue(req.body.first_name)
    const lastName = textValue(req.body.lastName) || textValue(req.body.last_name)
    const gender = textValue(req.body.gender) || null
    const dateOfBirth = req.body.date_of_birth || req.body.dob || null
    const nationalId = textValue(req.body.national_id) || textValue(req.body.nationalId) || null
    const bloodGroup = textValue(req.body.blood_group) || textValue(req.body.bloodGroup) || null
    const heightVal = req.body.height !== undefined && req.body.height !== '' ? Number(req.body.height) : null
    const weightVal = req.body.weight !== undefined && req.body.weight !== '' ? Number(req.body.weight) : null
    const eyeColor = textValue(req.body.eye_color) || textValue(req.body.eyeColor) || null
    const hairColor = textValue(req.body.hair_color) || textValue(req.body.hairColor) || null
    const photo = textValue(req.body.photo) || null
    const missingDate = req.body.missing_date || req.body.missingDate
    const lastSeenLocation = textValue(req.body.last_seen_location) || textValue(req.body.location) || null
    const city = textValue(req.body.city) || null
    const description = textValue(req.body.description) || null
    const status = textValue(req.body.status) || 'Missing'

    if (typeof firstName !== 'string' || typeof lastName !== 'string' || !firstName || !lastName || !missingDate || !status) {
      return res.status(400).json({
        success: false,
        message: 'First name, last name, missing date, and status are required.',
      })
    }

    if (gender && !VALID_GENDERS.has(gender)) {
      return res.status(400).json({ success: false, message: 'Invalid gender value.' })
    }
    if (!VALID_STATUSES.has(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value.' })
    }

    if (!isValidDate(missingDate) || dateOfBirth && !isValidDate(dateOfBirth)) {
      return res.status(400).json({ success: false, message: 'Invalid date value.' })
    }

    if (!isValidPhotoUrl(photo)) {
      return res.status(400).json({ success: false, message: 'Photo must be a valid HTTP or HTTPS URL.' })
    }

    // Validate height/weight numeric range
    if (heightVal !== null && (!Number.isFinite(heightVal) || heightVal <= 0)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid height value.',
      })
    }
    if (weightVal !== null && (!Number.isFinite(weightVal) || weightVal <= 0)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid weight value.',
      })
    }

    // Validate national ID uniqueness
    if (nationalId && (await nationalIdExists(nationalId))) {
      return res.status(400).json({
        success: false,
        message: 'A missing person with this National ID already exists.',
      })
    }

    const newPerson = await dbCreateMissingPerson({
      firstName,
      lastName,
      gender,
      dateOfBirth,
      nationalId,
      bloodGroup,
      height: heightVal,
      weight: weightVal,
      eyeColor,
      hairColor,
      photo,
      missingDate,
      lastSeenLocation,
      city,
      description,
      status,
    })

    return res.status(201).json({
      success: true,
      message: 'Missing person registered successfully.',
      missingPerson: formatMissingPerson(newPerson),
    })
  } catch (error) {
    console.error('Create missing person error:', error)
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        message: 'A missing person with this National ID already exists.',
      })
    }
    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
    })
  }
}

export async function updateMissingPerson(req, res) {
  try {
    const id = parsePersonId(req.params.id)
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Invalid person id.',
      })
    }

    const existing = await findMissingPersonById(id)
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Missing person not found.',
      })
    }

    const firstName = textValue(req.body.firstName) || textValue(req.body.first_name)
    const lastName = textValue(req.body.lastName) || textValue(req.body.last_name)
    const gender = textValue(req.body.gender) || null
    const dateOfBirth = req.body.date_of_birth || req.body.dob || null
    const nationalId = textValue(req.body.national_id) || textValue(req.body.nationalId) || null
    const bloodGroup = textValue(req.body.blood_group) || textValue(req.body.bloodGroup) || null
    const heightVal = req.body.height !== undefined && req.body.height !== '' ? Number(req.body.height) : null
    const weightVal = req.body.weight !== undefined && req.body.weight !== '' ? Number(req.body.weight) : null
    const eyeColor = textValue(req.body.eye_color) || textValue(req.body.eyeColor) || null
    const hairColor = textValue(req.body.hair_color) || textValue(req.body.hairColor) || null
    const photo = textValue(req.body.photo) || null
    const missingDate = req.body.missing_date || req.body.missingDate
    const lastSeenLocation = textValue(req.body.last_seen_location) || textValue(req.body.location) || null
    const city = textValue(req.body.city) || null
    const description = textValue(req.body.description) || null
    const status = textValue(req.body.status) || 'Missing'

    if (typeof firstName !== 'string' || typeof lastName !== 'string' || !firstName || !lastName || !missingDate || !status) {
      return res.status(400).json({
        success: false,
        message: 'First name, last name, missing date, and status are required.',
      })
    }

    if (gender && !VALID_GENDERS.has(gender)) {
      return res.status(400).json({ success: false, message: 'Invalid gender value.' })
    }
    if (!VALID_STATUSES.has(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value.' })
    }

    if (!isValidDate(missingDate) || dateOfBirth && !isValidDate(dateOfBirth)) {
      return res.status(400).json({ success: false, message: 'Invalid date value.' })
    }

    if (!isValidPhotoUrl(photo)) {
      return res.status(400).json({ success: false, message: 'Photo must be a valid HTTP or HTTPS URL.' })
    }

    // Validate height/weight numeric range
    if (heightVal !== null && (!Number.isFinite(heightVal) || heightVal <= 0)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid height value.',
      })
    }
    if (weightVal !== null && (!Number.isFinite(weightVal) || weightVal <= 0)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid weight value.',
      })
    }

    // Validate national ID uniqueness
    if (nationalId && (await nationalIdExists(nationalId, id))) {
      return res.status(400).json({
        success: false,
        message: 'A missing person with this National ID already exists.',
      })
    }

    const updatedPerson = await dbUpdateMissingPerson(id, {
      firstName,
      lastName,
      gender,
      dateOfBirth,
      nationalId,
      bloodGroup,
      height: heightVal,
      weight: weightVal,
      eyeColor,
      hairColor,
      photo,
      missingDate,
      lastSeenLocation,
      city,
      description,
      status,
    })

    return res.status(200).json({
      success: true,
      message: 'Missing person updated successfully.',
      missingPerson: formatMissingPerson(updatedPerson),
    })
  } catch (error) {
    console.error('Update missing person error:', error)
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        message: 'A missing person with this National ID already exists.',
      })
    }
    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
    })
  }
}

export async function deleteMissingPerson(req, res) {
  try {
    const id = parsePersonId(req.params.id)
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Invalid person id.',
      })
    }

    const existing = await findMissingPersonById(id)
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Missing person not found.',
      })
    }

    // Check delete safety
    if (await missingPersonHasCases(id)) {
      return res.status(409).json({
        success: false,
        message: 'This missing person record is linked to an active case file and cannot be deleted.',
      })
    }

    await dbDeleteMissingPerson(id)

    return res.status(200).json({
      success: true,
      message: 'Missing person deleted successfully.',
    })
  } catch (error) {
    console.error('Delete missing person error:', error)
    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
    })
  }
}
