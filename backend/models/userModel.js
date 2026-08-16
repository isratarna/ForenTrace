import pool from '../config/db.js'

export async function findUserByEmail(email) {
  const [rows] = await pool.execute(
    `
    SELECT
      u.user_id,
      u.username,
      u.email,
      u.password_hash,
      u.account_status,
      u.role_id,
      u.officer_id,
      u.technician_id,
      r.role_name
    FROM users u
    JOIN roles r ON u.role_id = r.role_id
    WHERE u.email = ?
    LIMIT 1
    `,
    [email]
  )

  return rows[0] || null
}

export async function updateLastLogin(userId) {
  await pool.execute(
    `
    UPDATE users
    SET last_login = CURRENT_TIMESTAMP
    WHERE user_id = ?
    `,
    [userId]
  )
}