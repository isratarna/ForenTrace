import api from './api'

// Gives every API case the same camelCase field names used by the UI.
function normalizeCase(record) {
  if (!record) return record

  const {
    case_id,
    person_id,
    station_id,
    officer_id,
    report_date,
    case_status,
    identified_date,
    case_notes,
    ...caseFile
  } = record
  const id = caseFile.id ?? caseFile.caseId ?? case_id
  const status = caseFile.status ?? caseFile.caseStatus ?? case_status
  const notes = caseFile.notes ?? caseFile.caseNotes ?? case_notes ?? ''

  return {
    ...caseFile,
    id,
    caseId: caseFile.caseId ?? id,
    personId: caseFile.personId ?? person_id,
    stationId: caseFile.stationId ?? station_id,
    officerId: caseFile.officerId ?? officer_id,
    reportDate: caseFile.reportDate ?? report_date,
    status,
    caseStatus: caseFile.caseStatus ?? status,
    identifiedDate: caseFile.identifiedDate ?? identified_date ?? null,
    notes,
    caseNotes: caseFile.caseNotes ?? notes,
  }
}

// Loads all case files for the list page.
export async function getCases() {
  const response = await api.get('/cases')
  return response.data.cases.map(normalizeCase)
}

// Loads one case file for the details page.
export async function getCaseById(id) {
  const response = await api.get(`/cases/${id}`)
  return normalizeCase(response.data.case)
}

// Loads the totals used by the case dashboard.
export async function getCaseStatistics() {
  const response = await api.get('/cases/statistics')
  return {
    summary: response.data.summary,
    stationStatistics: response.data.stationStatistics,
    officerStatistics: response.data.officerStatistics,
  }
}

// Loads the officers whose workloads are above average.
export async function getAboveAverageOfficers() {
  const response = await api.get('/cases/statistics/above-average-officers')
  return response.data.aboveAverageOfficers ?? []
}

// Sends a new case file to the API and normalizes the saved result.
export async function createCase(data) {
  const response = await api.post('/cases', data)
  return normalizeCase(response.data.case)
}

// Sends case file changes to the API and normalizes the saved result.
export async function updateCase(id, data) {
  const response = await api.put(`/cases/${id}`, data)
  return normalizeCase(response.data.case)
}

// Deletes one case file through the API.
export async function deleteCase(id) {
  const response = await api.delete(`/cases/${id}`)
  return response.data
}

export default {
  getCases,
  getCaseById,
  getCaseStatistics,
  getAboveAverageOfficers,
  createCase,
  updateCase,
  deleteCase,
}
