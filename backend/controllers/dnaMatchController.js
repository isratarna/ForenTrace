import {
  findAllMatches,
  findMatchById,
  compareProfileCodes,
  findMatchBetween,
  createMatch as dbCreateMatch,
  updateMatchStatus as dbUpdateMatchStatus,
  deleteMatchById as dbDeleteMatch,
} from '../models/dnaMatchModel.js'
import { findSampleById } from '../models/dnaSampleModel.js' // sample access check er jonno reuse

// Match er allowed status ar confidence value
export const MATCH_STATUSES = ['Pending Review', 'Confirmed', 'Rejected']
const REVIEW_STATUSES = ['Confirmed', 'Rejected'] // review e ei duita te change kora jay
const CONFIDENCE_LEVELS = ['High', 'Medium', 'Low']

// Similarity theke confidence level — shudhu Manual (Option 2) similarity er jonno
// (Computed hole confidence stored procedure compare_dna_samples nijei dey — same threshold)
function confidenceFor(similarity) {
  if (similarity >= 90) return 'High'
  if (similarity >= 80) return 'Medium'
  return 'Low'
}

// Database er DATE ke YYYY-MM-DD format e convert
function formatDate(value) {
  if (!value) return null
  if (typeof value === 'string') return value.slice(0, 10)

  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Sample ta kar — family reference hole "Name (Relationship)", noile missing person er naam
function sampleProvider(familyName, relationship, personName) {
  return familyName ? `${familyName} (${relationship})` : personName
}

// Database row ke API response object e convert (camelCase + snake_case — MatchesList component er jonno)
export function formatMatch(row) {
  if (!row) return null

  const similarity = Number(row.similarity_percentage)

  return {
    id: row.match_id,
    matchId: row.match_id,
    match_id: row.match_id,
    unknownSampleId: row.unknown_sample_id,
    unknown_sample_id: row.unknown_sample_id,
    matchedSampleId: row.matched_sample_id,
    matched_sample_id: row.matched_sample_id,
    similarityPercentage: similarity,
    similarity_percentage: similarity,
    confidenceLevel: row.confidence_level,
    confidence_level: row.confidence_level,
    matchDate: formatDate(row.match_date),
    match_date: formatDate(row.match_date),
    matchStatus: row.match_status,
    match_status: row.match_status,
    matchMethod: row.match_method,
    // Unknown (evidence) sample er info
    unknownSample: {
      id: row.unknown_sample_id,
      personId: row.unknown_person_id,
      personName: row.unknown_person_name,
      provider: sampleProvider(row.unknown_family_name, row.unknown_family_relationship, row.unknown_person_name),
      sampleType: row.unknown_sample_type,
      profileCode: row.unknown_profile_code,
      labName: row.unknown_lab_name,
    },
    // Matched (reference) sample er info
    matchedSample: {
      id: row.matched_sample_id,
      personId: row.matched_person_id,
      personName: row.matched_person_name,
      personStatus: row.matched_person_status,
      provider: sampleProvider(row.matched_family_name, row.matched_family_relationship, row.matched_person_name),
      isFamilyReference: Boolean(row.matched_family_id),
      sampleType: row.matched_sample_type,
      profileCode: row.matched_profile_code,
      labName: row.matched_lab_name,
    },
  }
}

// URL/body theke asha id valid positive integer kina
function parseId(value) {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) return null
  return id
}

// snake_case ba camelCase — je kono naam er field pora
function readField(body, ...names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(body, name)) {
      return { provided: true, value: body[name] }
    }
  }

  return { provided: false, value: undefined }
}

// Compare/create er age duita sample check kore — error thakle { status, message }
async function validatePair(body, user) {
  const unknownSampleId = parseId(readField(body, 'unknown_sample_id', 'unknownSampleId').value)
  const matchedSampleId = parseId(readField(body, 'matched_sample_id', 'matchedSampleId').value)

  if (!unknownSampleId || !matchedSampleId) {
    return { error: { status: 400, message: 'Unknown sample ID and matched sample ID are required.' } }
  }

  if (unknownSampleId === matchedSampleId) {
    return { error: { status: 400, message: 'A sample cannot be compared with itself.' } }
  }

  // User er scope e na thakle null ashbe (officer = nijer case, technician = nijer lab)
  const unknown = await findSampleById(unknownSampleId, user)
  if (!unknown) {
    return { error: { status: 404, message: 'Unknown sample not found.' } }
  }

  const matched = await findSampleById(matchedSampleId, user)
  if (!matched) {
    return { error: { status: 404, message: 'Matched sample not found.' } }
  }

  // Unknown sample hobe evidence/missing person er sample — family reference na
  if (unknown.family_id) {
    return { error: { status: 400, message: 'The unknown sample must be a missing person / evidence sample, not a family reference.' } }
  }

  // Analysis chara profile code thake na — compare kora jabe na
  if (unknown.status !== 'Analyzed' || !unknown.dna_profile_code || matched.status !== 'Analyzed' || !matched.dna_profile_code) {
    return { error: { status: 400, message: 'Both samples must be analyzed with a DNA profile code before comparison.' } }
  }

  // Sample row o ferot dei — compare preview te profile code dekhanor jonno
  return { unknownSampleId, matchedSampleId, unknown, matched }
}

// GET /api/dna-matches — role onujayi scoped match list
export async function listMatches(req, res) {
  try {
    const status = req.query.status?.trim() || ''
    const confidence = req.query.confidence?.trim() || ''

    if (status && !MATCH_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid match status filter.' })
    }

    if (confidence && !CONFIDENCE_LEVELS.includes(confidence)) {
      return res.status(400).json({ success: false, message: 'Invalid confidence filter.' })
    }

    const matches = await findAllMatches(
      {
        status: status || undefined,
        confidence: confidence || undefined,
        personId: parseId(req.query.person_id ?? req.query.personId) || undefined,
        caseId: parseId(req.query.case_id ?? req.query.caseId) || undefined,
        sampleId: parseId(req.query.sample_id ?? req.query.sampleId) || undefined,
      },
      req.session.user
    )

    return res.status(200).json({ success: true, matches: matches.map(formatMatch) })
  } catch (error) {
    console.error('List DNA matches error:', error)
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}

// GET /api/dna-matches/:id — ekta match er details
export async function getMatch(req, res) {
  try {
    const id = parseId(req.params.id)
    if (!id) {
      return res.status(400).json({ success: false, message: 'Invalid match id.' })
    }

    const match = await findMatchById(id, req.session.user)
    if (!match) {
      return res.status(404).json({ success: false, message: 'DNA match not found.' })
    }

    return res.status(200).json({ success: true, match: formatMatch(match) })
  } catch (error) {
    console.error('Get DNA match error:', error)
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}

// POST /api/dna-matches/compare — shudhu comparison result dekhay (save kore na) — preview er jonno
export async function compareSamples(req, res) {
  try {
    const pair = await validatePair(req.body || {}, req.session.user)
    if (pair.error) {
      return res.status(pair.error.status).json({ success: false, message: pair.error.message })
    }

    const result = await compareProfileCodes(pair.unknownSampleId, pair.matchedSampleId)
    const similarity = Number(result.similarity_percentage)
    const existing = await findMatchBetween(pair.unknownSampleId, pair.matchedSampleId) // age save kora ache kina

    return res.status(200).json({
      success: true,
      comparison: {
        unknownSampleId: pair.unknownSampleId,
        matchedSampleId: pair.matchedSampleId,
        unknownProfileCode: pair.unknown.dna_profile_code,
        matchedProfileCode: pair.matched.dna_profile_code,
        codeLength: Number(result.max_length), // procedure er OUT p_code_length
        matchingPositions: Number(result.matching_positions), // procedure er OUT p_matching_positions
        similarityPercentage: similarity,
        confidenceLevel: result.confidence_level, // procedure er OUT p_confidence
        existingMatchId: existing?.match_id ?? null,
      },
    })
  } catch (error) {
    console.error('Compare DNA samples error:', error)
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}

// POST /api/dna-matches — match record create
// Option 1: similarity na dile SQL diye compute (Computed)
// Option 2: Admin/Officer similarityPercentage dile sheta use (Manual)
export async function createMatch(req, res) {
  try {
    const body = req.body || {}
    const user = req.session.user

    const pair = await validatePair(body, user)
    if (pair.error) {
      return res.status(pair.error.status).json({ success: false, message: pair.error.message })
    }

    // Same jora age compare kora thakle notun record na
    if (await findMatchBetween(pair.unknownSampleId, pair.matchedSampleId)) {
      return res.status(409).json({ success: false, message: 'These two samples have already been compared.' })
    }

    const manualField = readField(body, 'similarity_percentage', 'similarityPercentage')
    const isManual = manualField.provided && manualField.value !== null && manualField.value !== ''

    let similarity
    let confidenceLevel
    if (isManual) {
      // Manual similarity shudhu Admin/Officer dite parbe — technician ke compute use korte hobe
      if (user.role === 'Lab Technician') {
        return res.status(403).json({ success: false, message: 'Only Admin and Officer can enter similarity manually.' })
      }

      similarity = Number(manualField.value)
      if (!Number.isFinite(similarity) || similarity < 0 || similarity > 100) {
        return res.status(400).json({ success: false, message: 'Similarity percentage must be a number between 0 and 100.' })
      }
      similarity = Math.round(similarity * 100) / 100 // DECIMAL(5,2) er jonno 2 decimal
      confidenceLevel = confidenceFor(similarity)
    } else {
      // Computed: stored procedure CALL — similarity ar confidence duitai procedure theke
      const result = await compareProfileCodes(pair.unknownSampleId, pair.matchedSampleId)
      similarity = Number(result.similarity_percentage)
      confidenceLevel = result.confidence_level
    }

    const match = await dbCreateMatch({
      unknownSampleId: pair.unknownSampleId,
      matchedSampleId: pair.matchedSampleId,
      similarityPercentage: similarity,
      confidenceLevel,
      matchMethod: isManual ? 'Manual' : 'Computed',
    })

    return res.status(201).json({
      success: true,
      message: 'DNA match recorded successfully.',
      match: formatMatch(match),
    })
  } catch (error) {
    console.error('Create DNA match error:', error)
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'These two samples have already been compared.' })
    }
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}

// PUT /api/dna-matches/:id/status — review: Pending Review → Confirmed / Rejected
// (Issue 5 er trigger 'Confirmed' hole missing person ke 'Identified' korbe)
export async function reviewMatch(req, res) {
  try {
    const id = parseId(req.params.id)
    if (!id) {
      return res.status(400).json({ success: false, message: 'Invalid match id.' })
    }

    const matchStatus = typeof req.body?.matchStatus === 'string'
      ? req.body.matchStatus.trim()
      : typeof req.body?.match_status === 'string' ? req.body.match_status.trim() : ''

    if (!REVIEW_STATUSES.includes(matchStatus)) {
      return res.status(400).json({ success: false, message: 'Match status must be Confirmed or Rejected.' })
    }

    const existing = await findMatchById(id, req.session.user)
    if (!existing) {
      return res.status(404).json({ success: false, message: 'DNA match not found.' })
    }

    // Ekbar review hoye gele abar change kora jabe na
    if (existing.match_status !== 'Pending Review') {
      return res.status(409).json({ success: false, message: 'Only matches pending review can be updated.' })
    }

    // UPDATE er shathe shathe database trigger (trg_dna_match_confirmed_update — Issue 5)
    // matched sample er missing person ke 'Identified' kore dey — ekhane alada code lage na
    await dbUpdateMatchStatus(id, matchStatus)
    const match = await findMatchById(id) // trigger er por fresh data (matched_person_status)

    // Confirmed hole trigger er result response e janai
    const identified = matchStatus === 'Confirmed' && match.matched_person_status === 'Identified'
    const message = identified
      ? `DNA match confirmed. ${match.matched_person_name} is now marked as Identified.`
      : `DNA match ${matchStatus.toLowerCase()}.`

    return res.status(200).json({
      success: true,
      message,
      match: formatMatch(match),
    })
  } catch (error) {
    console.error('Review DNA match error:', error)
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}

// DELETE /api/dna-matches/:id — shudhu Admin, ar Confirmed match delete kora jabe na
export async function deleteMatch(req, res) {
  try {
    const id = parseId(req.params.id)
    if (!id) {
      return res.status(400).json({ success: false, message: 'Invalid match id.' })
    }

    const existing = await findMatchById(id)
    if (!existing) {
      return res.status(404).json({ success: false, message: 'DNA match not found.' })
    }

    // Confirmed match identification er proof — delete kora jabe na
    if (existing.match_status === 'Confirmed') {
      return res.status(409).json({ success: false, message: 'Confirmed matches cannot be deleted.' })
    }

    await dbDeleteMatch(id)

    return res.status(200).json({ success: true, message: 'DNA match deleted successfully.' })
  } catch (error) {
    console.error('Delete DNA match error:', error)
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}
