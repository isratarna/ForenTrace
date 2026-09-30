import api from './api'

// dnaService: DNA sample (/api/dna-samples) ar DNA match (/api/dna-matches) — duitai real backend theke ashe.

// ---------- DNA Samples (real API) ----------

// Sample list — params: { search, status, person_id, family_id, lab_id, case_id }
export async function getSamples(params = {}) {
  const response = await api.get('/dna-samples', { params })
  return response.data.samples ?? []
}

// Ekta sample er details
export async function getSampleById(id) {
  const response = await api.get(`/dna-samples/${id}`)
  return response.data.sample
}

// Notun sample register
export async function createSample(data) {
  const response = await api.post('/dna-samples', data)
  return response.data.sample
}

// Sample er collection info update
export async function updateSample(id, data) {
  const response = await api.put(`/dna-samples/${id}`, data)
  return response.data.sample
}

// Sample delete
export async function deleteSample(id) {
  const response = await api.delete(`/dna-samples/${id}`)
  return response.data
}

// Missing person details page er DNA Samples tab er jonno
export async function getSamplesByPerson(personId) {
  return getSamples({ person_id: personId })
}

// Case details page er DNA Samples section er jonno
export async function getSamplesByCase(caseId) {
  return getSamples({ case_id: caseId })
}

// Lab technician er analysis update — shudhu { status, dnaProfileCode, analysisDate, remarks } (Issue 3)
export async function updateSampleAnalysis(id, data) {
  const response = await api.put(`/dna-samples/${id}/analysis`, data)
  return response.data.sample
}

// Technician er nijer lab er workload summary (Awaiting / In Analysis / Analyzed / Rejected count)
export async function getLabSummary() {
  const response = await api.get('/dna-samples/lab/summary')
  return response.data.summary
}

// UNION report: Matched + Awaiting Match sample (Issue 6)
// Response: { summary: { matched, awaitingMatch, total }, report: [...] }
export async function getSampleOverviewReport() {
  const response = await api.get('/dna-samples/report/overview')
  return {
    summary: response.data.summary,
    report: response.data.report ?? [],
  }
}

// Missing person er family member + tader reference DNA sample (Issue 2)
// Response: { summary: {...}, familyMembers: [{ familyId, name, relationship, phone, samples: [...] }] }
export async function getFamilyDnaByPerson(personId) {
  const response = await api.get(`/dna-samples/family/${personId}`)
  return {
    summary: response.data.summary,
    familyMembers: response.data.familyMembers ?? [],
  }
}

// ---------- Lab lookups (sample form er dropdown er jonno) ----------

// Shob DNA lab (GET /api/labs → { success, data })
export async function getLabs() {
  const response = await api.get('/labs')
  return response.data.data ?? []
}

// Shob lab technician (GET /api/technicians → { success, data })
export async function getTechnicians() {
  const response = await api.get('/technicians')
  return response.data.data ?? []
}

// ---------- DNA Matches (real API — Issue 4) ----------

// Match list — params: { status, confidence, person_id, case_id, sample_id }
export async function getMatches(params = {}) {
  const response = await api.get('/dna-matches', { params })
  return response.data.matches ?? []
}

// Ekta match er details
export async function getMatchById(id) {
  const response = await api.get(`/dna-matches/${id}`)
  return response.data.match
}

// Duita sample compare (save kore na) — { unknownSampleId, matchedSampleId }
export async function compareSamples(data) {
  const response = await api.post('/dna-matches/compare', data)
  return response.data.comparison
}

// Match save — similarityPercentage dile Manual (Admin/Officer), na dile Computed
export async function createMatch(data) {
  const response = await api.post('/dna-matches', data)
  return response.data.match
}

// Review: 'Confirmed' ba 'Rejected'
export async function updateMatchStatus(id, matchStatus) {
  const response = await api.put(`/dna-matches/${id}/status`, { matchStatus })
  return response.data.match
}

// Match delete (Admin)
export async function deleteMatch(id) {
  const response = await api.delete(`/dna-matches/${id}`)
  return response.data
}

// Missing person details page er DNA Matches tab er jonno
export async function getMatchesByPerson(personId) {
  return getMatches({ person_id: personId })
}

// Case details page er DNA Matches section er jonno
export async function getMatchesByCase(caseId) {
  return getMatches({ case_id: caseId })
}

export default {
  getSamples,
  getSampleById,
  createSample,
  updateSample,
  deleteSample,
  getSamplesByPerson,
  getSamplesByCase,
  getFamilyDnaByPerson,
  updateSampleAnalysis,
  getLabSummary,
  getSampleOverviewReport,
  getLabs,
  getTechnicians,
  getMatches,
  getMatchById,
  compareSamples,
  createMatch,
  updateMatchStatus,
  deleteMatch,
  getMatchesByPerson,
  getMatchesByCase,
}
