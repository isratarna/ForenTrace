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
  }
}

export async function getMissingPersons(params = {}) {
  const response = await api.get('/missing-persons', { params })
  const records = response.data.missingPersons ?? response.data.missingPeople ?? response.data.persons ?? response.data.people ?? response.data.data ?? []
  return Array.isArray(records) ? records.map(normalizeMissingPerson) : []
}

export default {
  getMissingPersons,
}
