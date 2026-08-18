import api from './api'

export async function getOfficers(params = {}) {
  const response = await api.get('/officers', { params })
  return response.data.officers
}

export async function getOfficerById(id) {
  const response = await api.get(`/officers/${id}`)
  return response.data.officer
}

export async function createOfficer(data) {
  const response = await api.post('/officers', data)
  return response.data.officer
}

export async function updateOfficer(id, data) {
  const response = await api.put(`/officers/${id}`, data)
  return response.data.officer
}

export async function deleteOfficer(id) {
  const response = await api.delete(`/officers/${id}`)
  return response.data
}
