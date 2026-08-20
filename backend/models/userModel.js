import pool from '../config/db.js'

const userSelect = `
  SELECT
    u.user_id,
    u.username,
    u.email,
    u.account_status,
    u.created_at,
    u.last_login,
    u.role_id,
    u.officer_id,
    u.technician_id,
    r.role_name
  FROM users u
  JOIN roles r ON u.role_id = r.role_id
`

export async function findUserByEmail(email) {
  const [rows] = await pool.execute(
    `
    SELECT
      u.user_id,
      u.username,
      u.email,
      u.password_hash,
      u.account_status,
      u.created_at,
      u.last_login,
      u.role_id,
      u.officer_id,
      u.technician_id,
      r.role_name
    FROM users u
    JOIN roles r ON u.role_id = r.role_id
    WHERE u.email = ?
    LIMIT 1
    `,
    [email.trim().toLowerCase()]
  )

  return rows[0] || null
}

export async function findUserById(userId) {
  const [rows] = await pool.execute(
    `${userSelect} WHERE u.user_id = ? LIMIT 1`,
    [userId]
  )

  return rows[0] || null
}

export async function findAllUsers({ search, status } = {}) {
  let sql = `${userSelect} WHERE 1 = 1`
  const params = []

  if (status) {
    sql += ' AND u.account_status = ?'
    params.push(status)
  }

  if (search) {
    sql += ' AND (u.username LIKE ? OR u.email LIKE ? OR r.role_name LIKE ?)'
    const term = `%${search}%`
    params.push(term, term, term)
  }

  sql += ' ORDER BY u.user_id ASC'

  const [rows] = await pool.execute(sql, params)
  return rows
}

export async function findRoleByName(roleName) {
  const [rows] = await pool.execute(
    'SELECT role_id, role_name FROM roles WHERE role_name = ? LIMIT 1',
    [roleName]
  )

  return rows[0] || null
}

export async function emailExists(email, excludeUserId = null) {
  let sql = 'SELECT user_id FROM users WHERE email = ?'
  const params = [email.trim().toLowerCase()]

  if (excludeUserId) {
    sql += ' AND user_id != ?'
    params.push(excludeUserId)
  }

  sql += ' LIMIT 1'

  const [rows] = await pool.execute(sql, params)
  return rows.length > 0
}

export async function usernameExists(username, excludeUserId = null) {
  let sql = 'SELECT user_id FROM users WHERE username = ?'
  const params = [username.trim()]

  if (excludeUserId) {
    sql += ' AND user_id != ?'
    params.push(excludeUserId)
  }

  sql += ' LIMIT 1'

  const [rows] = await pool.execute(sql, params)
  return rows.length > 0
}

export async function createUser({
  username,
  email,
  passwordHash,
  roleId,
  accountStatus = 'pending_approval',
}) {
  const [result] = await pool.execute(
    `
    INSERT INTO users
      (role_id, officer_id, technician_id, username, password_hash, email, account_status)
    VALUES (?, NULL, NULL, ?, ?, ?, ?)
    `,
    [roleId, username.trim(), passwordHash, email.trim().toLowerCase(), accountStatus]
  )

  return findUserById(result.insertId)
}

export async function updateUserById(userId, { username, email, roleId }) {
  await pool.execute(
    `
    UPDATE users
    SET username = ?, email = ?, role_id = ?
    WHERE user_id = ?
    `,
    [username.trim(), email.trim().toLowerCase(), roleId, userId]
  )

  return findUserById(userId)
}

export async function updateUserStatus(userId, accountStatus) {
  await pool.execute(
    `
    UPDATE users
    SET account_status = ?
    WHERE user_id = ?
    `,
    [accountStatus, userId]
  )

  return findUserById(userId)
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
export async function generateUniqueUsername(firstName, lastName) {

  const baseUsername =
    `${firstName.trim().toLowerCase()}.${lastName.trim().toLowerCase()}`

  let username = baseUsername
  let counter = 1

  while (await usernameExists(username)) {
    username = `${baseUsername}${counter}`
    counter++
  }

  return username
}
