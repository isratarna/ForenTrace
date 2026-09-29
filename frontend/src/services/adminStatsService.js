import api from './api'

export async function getAdminCounts() {
  const response = await api.get('/admin/counts')
  return {
    policeStationCount: response.data.policeStationCount,
    dnaLabCount: response.data.dnaLabCount,
    samplesAwaitingAnalysis: response.data.samplesAwaitingAnalysis ?? null,
  }
}

export default { getAdminCounts }
