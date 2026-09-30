import pool from '../config/db.js'
import { getLabsWithoutTechnicians as fetchLabsWithoutTechnicians } from '../models/dnaLabModel.js'

export async function labsWithoutTechnicians(req, res) {
  try {
    const labs = await fetchLabsWithoutTechnicians()
    return res.status(200).json({ success: true, labs })
  } catch (error) {
    console.error('Labs without technicians report error:', error)
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}

export async function intersectionLabs(req, res) {
  try {
    const sql = `
      SELECT
        dl.lab_name AS lab_name,
        COUNT(lt.technician_id) AS capacity
      FROM dna_labs dl
      JOIN lab_technicians lt ON dl.lab_id = lt.lab_id
      WHERE dl.lab_id IN (
        SELECT lab_id
        FROM lab_technicians
        GROUP BY lab_id
        HAVING COUNT(technician_id) > (
          SELECT COUNT(technician_id) / COUNT(DISTINCT lab_id)
          FROM lab_technicians
        )
      )
      AND dl.lab_id IN (
        SELECT DISTINCT lab_id FROM lab_technicians
      )
      GROUP BY dl.lab_id, dl.lab_name
      ORDER BY capacity DESC, dl.lab_name ASC
    `

    const [rows] = await pool.execute(sql)

    return res.status(200).json({ success: true, labs: rows })
  } catch (error) {
    console.error('Intersection labs report error:', error)
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}

export default { intersectionLabs }
