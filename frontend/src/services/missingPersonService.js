import api from './api'

function normalizeMissingPerson(record) {
  if (!record) return record

  const {
    person_id,
    first_name,
    last_name,
    ...person
  } = record
  const id = person.id ?? person.personId ?? person_id
  const firstName = person.firstName ?? first_name ?? ''
  const lastName = person.lastName ?? last_name ?? ''

  return {
    ...person,
    id,
    personId: person.personId ?? id,
    firstName,
    lastName,
    name: person.name ?? `${firstName} ${lastName}`.trim(),
    dob: person.dob ?? person.date_of_birth ?? '',
    gender: person.gender ?? '',
    nationalId: person.nationalId ?? person.national_id ?? '',
    bloodGroup: person.bloodGroup ?? person.blood_group ?? '',
    height: person.height,
    weight: person.weight,
    eyeColor: person.eyeColor ?? person.eye_color ?? '',
    hairColor: person.hairColor ?? person.hair_color ?? '',
    photo: person.photo ?? '',
    missingDate: person.missingDate ?? person.missing_date ?? '',
    location: person.location ?? person.last_seen_location ?? '',
    lastSeenLocation: person.lastSeenLocation ?? person.last_seen_location ?? '',
    city: person.city ?? '',
    description: person.description ?? '',
    status: person.status ?? '',
  }
}

export async function getMissingPersons(params = {}) {
  const response = await api.get('/missing-persons', { params })
  const records = response.data.missingPersons ?? response.data.missingPeople ?? response.data.persons ?? response.data.data ?? []
  return Array.isArray(records) ? records.map(normalizeMissingPerson) : []
}

export async function getMissingPersonById(id) {
  const response = await api.get(`/missing-persons/${id}`)
  return normalizeMissingPerson(response.data.missingPerson)
}

export async function createMissingPerson(data) {
  const response = await api.post('/missing-persons', data)
  return normalizeMissingPerson(response.data.missingPerson)
}

export async function updateMissingPerson(id, data) {
  const response = await api.put(`/missing-persons/${id}`, data)
  return normalizeMissingPerson(response.data.missingPerson)
}

export async function deleteMissingPerson(id) {
  const response = await api.delete(`/missing-persons/${id}`)
  return response.data
}

export async function getMissingPersonStatistics() {
  const response = await api.get('/missing-persons/statistics')
  return {
    summary: response.data.summary,
    byCity: response.data.byCity ?? [],
    citiesWithAtLeastTwo: response.data.citiesWithAtLeastTwo ?? [],
  }
}

export async function getAboveAverageCityPersons() {
  const response = await api.get('/missing-persons/statistics/above-average-cities')
  return response.data.missingPersons ?? []
}

export default {
  getMissingPersons,
  getMissingPersonById,
  createMissingPerson,
  updateMissingPerson,
  deleteMissingPerson,
  getMissingPersonStatistics,
  getAboveAverageCityPersons,
}
