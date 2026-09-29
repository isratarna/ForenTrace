import pool from '../config/db.js'

export async function findAdminCounts() {
  // police station count
  const [stationRows] = await pool.execute('SELECT COUNT(*) AS station_count FROM police_stations')
  const stationCount = stationRows[0]?.station_count ?? 0

  // dna lab count
  const [labRows] = await pool.execute('SELECT COUNT(*) AS lab_count FROM dna_labs')
  const labCount = labRows[0]?.lab_count ?? 0

  // samples awaiting analysis — table may not exist yet. handle missing table gracefully.
  let samplesAwaiting = null
  try {
    const [sampleRows] = await pool.execute("SELECT COUNT(*) AS awaiting FROM dna_samples WHERE status = 'Awaiting Analysis'")
    samplesAwaiting = sampleRows[0]?.awaiting ?? 0
  } catch (err) {
    // If the table is missing, return null for this value.
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      samplesAwaiting = null
    } else {
      throw err
    }
  }

  return {
    policeStationCount: Number(stationCount),
    dnaLabCount: Number(labCount),
    samplesAwaitingAnalysis: samplesAwaiting === null ? null : Number(samplesAwaiting),
  }
}

export default {
  findAdminCounts,
}
