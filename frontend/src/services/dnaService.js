// dnaService: provides DNA samples and matches. Uses mock data until backend endpoints exist.
const USE_MOCK = true

// When mock is enabled, generate simple sample and match rows per requested id.
export const isMockDna = () => USE_MOCK

function buildSamples(id, { personId = null, caseId = null } = {}) {
  const sampleKey = id ?? 'ANY'
  const sampleRows = [1, 2].map(index => ({
    sample_id: `MOCK-S-${sampleKey}-${index}`,
    person_id: personId,
    family_id: null,
    sample_type: 'Buccal swab',
    collection_date: '2026-09-01',
    dna_profile_code: index === 1 ? `MOCK-DNA-${sampleKey}-1` : null,
    status: index === 1 ? 'Analyzed' : 'Awaiting Analysis',
    case_id: caseId,
  }))
  return sampleRows
}

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

// Public functions
export async function getSamplesByPerson(personId) {
  if (USE_MOCK) {
    return Promise.resolve(buildSamples(personId, { personId }))
  }

  // TODO: Member 1 - wire to real API when /api/dna-samples exists
  // Example: return api.get(`/dna-samples?person_id=${personId}`).then(r => r.data)
  throw new Error('dnaService: dna samples API not implemented')
}

export async function getMatchesByPerson(personId) {
  if (USE_MOCK) {
    return Promise.resolve(buildMatches(personId))
  }

  // TODO: Member 1 - wire to real API when /api/dna-matches exists
  throw new Error('dnaService: dna matches API not implemented')
}

export async function getSamplesByCase(caseId) {
  if (USE_MOCK) {
    return Promise.resolve(buildSamples(caseId, { caseId }))
  }
  throw new Error('dnaService: dna samples API not implemented')
}

export async function getMatchesByCase(caseId) {
  if (USE_MOCK) {
    return Promise.resolve(buildMatches(caseId))
  }
  throw new Error('dnaService: dna matches API not implemented')
}

export default {
  isMockDna,
  getSamplesByPerson,
  getMatchesByPerson,
  getSamplesByCase,
  getMatchesByCase,
}
