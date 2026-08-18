import api from './api'

export async function getStations(params = {}) {
  const response = await api.get('/police-stations', { params })
  return response.data.stations
}

export async function getStationById(id) {
  const response = await api.get(`/police-stations/${id}`)
  return response.data.station
}

export async function createStation(data) {
  const response = await api.post('/police-stations', data)
  return response.data.station
}

export async function updateStation(id, data) {
  const response = await api.put(`/police-stations/${id}`, data)
  return response.data.station
}

export async function deleteStation(id) {
  const response = await api.delete(`/police-stations/${id}`)
  return response.data
}

export default {
  getStations,
  getStationById,
  createStation,
  updateStation,
  deleteStation,
}
