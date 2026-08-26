import {
  findAllMissingPersons,
  findMissingPersonById,
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
  }
}

function parsePersonId(value) {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) return null
  return id
}

export async function listMissingPersons(req, res) {
  try {
    const search = req.query.search?.trim() || req.query.q?.trim() || ''
    const status = req.query.status?.trim() || ''
    const gender = req.query.gender?.trim() || ''
    const city = req.query.city?.trim() || ''
    const missingDate = req.query.missingDate?.trim() || req.query.missing_date?.trim() || ''

    const persons = await findAllMissingPersons({
      search,
      status: status || undefined,
      gender: gender || undefined,
      city: city || undefined,
      missingDate: missingDate || undefined,
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
    const firstName = req.body.firstName?.trim() || req.body.first_name?.trim()
    const lastName = req.body.lastName?.trim() || req.body.last_name?.trim()
    const gender = req.body.gender?.trim() || null
    const dateOfBirth = req.body.date_of_birth || req.body.dob || null
    const nationalId = req.body.national_id?.trim() || req.body.nationalId?.trim() || null
    const bloodGroup = req.body.blood_group?.trim() || req.body.bloodGroup?.trim() || null
    const heightVal = req.body.height !== undefined && req.body.height !== '' ? Number(req.body.height) : null
    const weightVal = req.body.weight !== undefined && req.body.weight !== '' ? Number(req.body.weight) : null
    const eyeColor = req.body.eye_color?.trim() || req.body.eyeColor?.trim() || null
    const hairColor = req.body.hair_color?.trim() || req.body.hairColor?.trim() || null
    const photo = req.body.photo?.trim() || null
    const missingDate = req.body.missing_date || req.body.missingDate
    const lastSeenLocation = req.body.last_seen_location?.trim() || req.body.location?.trim() || null
    const city = req.body.city?.trim() || null
    const description = req.body.description?.trim() || null
    const status = req.body.status?.trim() || 'Missing'

    if (!firstName || !lastName || !missingDate || !status) {
      return res.status(400).json({
        success: false,
        message: 'First name, last name, missing date, and status are required.',
      })
    }

    // Validate height/weight numeric range
    if (heightVal !== null && (isNaN(heightVal) || heightVal <= 0)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid height value.',
      })
    }
    if (weightVal !== null && (isNaN(weightVal) || weightVal <= 0)) {
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

    const firstName = req.body.firstName?.trim() || req.body.first_name?.trim()
    const lastName = req.body.lastName?.trim() || req.body.last_name?.trim()
    const gender = req.body.gender?.trim() || null
    const dateOfBirth = req.body.date_of_birth || req.body.dob || null
    const nationalId = req.body.national_id?.trim() || req.body.nationalId?.trim() || null
    const bloodGroup = req.body.blood_group?.trim() || req.body.bloodGroup?.trim() || null
    const heightVal = req.body.height !== undefined && req.body.height !== '' ? Number(req.body.height) : null
    const weightVal = req.body.weight !== undefined && req.body.weight !== '' ? Number(req.body.weight) : null
    const eyeColor = req.body.eye_color?.trim() || req.body.eyeColor?.trim() || null
    const hairColor = req.body.hair_color?.trim() || req.body.hairColor?.trim() || null
    const photo = req.body.photo?.trim() || null
    const missingDate = req.body.missing_date || req.body.missingDate
    const lastSeenLocation = req.body.last_seen_location?.trim() || req.body.location?.trim() || null
    const city = req.body.city?.trim() || null
    const description = req.body.description?.trim() || null
    const status = req.body.status?.trim() || 'Missing'

    if (!firstName || !lastName || !missingDate || !status) {
      return res.status(400).json({
        success: false,
        message: 'First name, last name, missing date, and status are required.',
      })
    }

    // Validate height/weight numeric range
    if (heightVal !== null && (isNaN(heightVal) || heightVal <= 0)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid height value.',
      })
    }
    if (weightVal !== null && (isNaN(weightVal) || weightVal <= 0)) {
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
