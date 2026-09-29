import api from './api'

// dnaService: DNA sample gulo ekhon real backend (/api/dna-samples) theke ashe.
// DNA match API Issue 4 e toiri hobe — totokkhon match gulo mock thakbe.
const USE_MOCK_MATCHES = true

// Match data ekhono mock kina (MatchesList e "(Sample data)" label dekhanor jonno)
export const isMockDna = () => USE_MOCK_MATCHES

function buildMatches(id) {
  const matchKey = id ?? 'ANY'
  const seed = Number(id) || 1
  const similarity = 70 + (seed * 7) % 30
  return [{
    match_id: `MOCK-M-${matchKey}-1`,
    unknown_sample_id: `MOCK-S-${matchKey}-1`,
    matched_sample_id: `MOCK-S-${matchKey}-2`,
    similarity_percentage: similarity,
    confidence_level: similarity >= 90 ? 'High' : similarity >= 80 ? 'Medium' : 'Low',
    match_date: '2026-09-01',
    match_status: 'Pending Review',
  }]
}

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

// ---------- DNA Matches (Issue 4 porjonto mock) ----------

export async function getMatchesByPerson(personId) {
  if (USE_MOCK_MATCHES) {
    return Promise.resolve(buildMatches(personId))
  }

  // TODO: Member 1 - Issue 4 e /api/dna-matches toiri hole connect hobe
  throw new Error('dnaService: dna matches API not implemented')
}

export async function getMatchesByCase(caseId) {
  if (USE_MOCK_MATCHES) {
    return Promise.resolve(buildMatches(caseId))
  }
  throw new Error('dnaService: dna matches API not implemented')
}

export default {
  isMockDna,
  getSamples,
  getSampleById,
  createSample,
  updateSample,
  deleteSample,
  getSamplesByPerson,
  getSamplesByCase,
  getFamilyDnaByPerson,
  getLabs,
  getTechnicians,
  getMatchesByPerson,
  getMatchesByCase,
}
