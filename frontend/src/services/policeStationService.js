import api from './api'

function normalizeStation(record) {
  if (!record) return record

  const {
    station_id,
    station_name,
    contact_number,
    created_at,
    ...station
  } = record
  const id = station.id ?? station.stationId ?? station_id
  const name = station.name ?? station.stationName ?? station_name
  const contact = station.contact ?? station.contactNumber ?? contact_number ?? ''

  return {
    ...station,
    id,
    stationId: station.stationId ?? id,
    name,
    stationName: station.stationName ?? name,
    contact,
    contactNumber: station.contactNumber ?? contact,
    createdAt: station.createdAt ?? created_at,
  }
}

export async function getStations(params = {}) {
  const response = await api.get('/police-stations', { params })
  return response.data.stations.map(normalizeStation)
}

export async function getStationById(id) {
  const response = await api.get(`/police-stations/${id}`)
  return normalizeStation(response.data.station)
}

export async function createStation(data) {
  const response = await api.post('/police-stations', data)
  return normalizeStation(response.data.station)
}

export async function updateStation(id, data) {
  const response = await api.put(`/police-stations/${id}`, data)
  return normalizeStation(response.data.station)
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
