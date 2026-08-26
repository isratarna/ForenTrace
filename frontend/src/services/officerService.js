import api from './api'

function normalizeOfficer(record) {
  if (!record) return record

  const {
    officer_id,
    station_id,
    station_name,
    first_name,
    last_name,
    badge_number,
    created_at,
    ...officer
  } = record
  const id = officer.id ?? officer.officerId ?? officer_id
  const firstName = officer.firstName ?? first_name ?? ''
  const lastName = officer.lastName ?? last_name ?? ''

  return {
    ...officer,
    id,
    officerId: officer.officerId ?? id,
    stationId: officer.stationId ?? station_id,
    station: officer.station ?? officer.stationName ?? station_name ?? '',
    firstName,
    lastName,
    name: officer.name ?? `${firstName} ${lastName}`.trim(),
    badge: officer.badge ?? officer.badgeNumber ?? badge_number,
    badgeNumber: officer.badgeNumber ?? officer.badge ?? badge_number,
    createdAt: officer.createdAt ?? created_at,
  }
}

export async function getOfficers(params = {}) {
  const response = await api.get('/officers', { params })
  return response.data.officers.map(normalizeOfficer)
}

export async function getOfficerById(id) {
  const response = await api.get(`/officers/${id}`)
  return normalizeOfficer(response.data.officer)
}

export async function createOfficer(data) {
  const response = await api.post('/officers', data)
  return normalizeOfficer(response.data.officer)
}

export async function updateOfficer(id, data) {
  const response = await api.put(`/officers/${id}`, data)
  return normalizeOfficer(response.data.officer)
}

export async function deleteOfficer(id) {
  const response = await api.delete(`/officers/${id}`)
  return response.data
}
