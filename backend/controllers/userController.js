import bcrypt from 'bcrypt'
import pool from '../config/db.js'
import {
  findAllUsers,
  findUserById,
  findRoleByName,
  generateUniqueUsername,
  findPasswordHashByUserId,
  updateUserPassword,
  countActiveAdmins,
  emailExists,
  usernameExists,
  updateUserById,
  updateUserStatus,
} from '../models/userModel.js'

const STATUS_TO_DB = {
  Active: 'active',
  Inactive: 'inactive',
  'Pending Approval': 'pending_approval',
}

const STATUS_FROM_DB = {
  active: 'Active',
  inactive: 'Inactive',
  pending_approval: 'Pending Approval',
}

const ALLOWED_ROLES = ['Admin', 'Officer', 'Lab Technician']
const ALLOWED_STATUSES = ['active', 'inactive', 'pending_approval']
const MIN_PASSWORD_LENGTH = 6

export function formatUser(row) {
  if (!row) return null

  const officerName = [row.officer_first_name, row.officer_last_name].filter(Boolean).join(' ')
  const technicianName = [row.technician_first_name, row.technician_last_name].filter(Boolean).join(' ')
  const linked = row.role_name === 'Officer'
    ? officerName ? `${officerName}${row.badge_number ? ` (Badge ${row.badge_number})` : ''}` : '—'
    : row.role_name === 'Lab Technician'
      ? technicianName ? `${technicianName}${row.technician_designation ? ` (${row.technician_designation})` : ''}` : '—'
      : '—'

  return {
    id: row.user_id,
    name: row.username,
    email: row.email,
    role: row.role_name,
    linked,
    station: '',
    lab: '',
    status: STATUS_FROM_DB[row.account_status] || row.account_status,
    lastLogin: row.last_login
      ? new Date(row.last_login).toLocaleString()
      : '—',
  }
}

function parseStatus(status) {
  if (!status) return null
  if (ALLOWED_STATUSES.includes(status)) return status
  return STATUS_TO_DB[status] || null
}

function parseUserId(value) {
  const userId = Number(value)
  if (!Number.isInteger(userId) || userId <= 0) return null
  return userId
}

async function activeAdminRemovalError(req, user) {
  if (user.role_name !== 'Admin' || user.account_status !== 'active') return null

  if (parseUserId(req.session?.user?.userId) === Number(user.user_id)) {
    return 'You cannot deactivate or demote your own active administrator account.'
  }

  if (await countActiveAdmins() <= 1) {
    return 'The last active administrator cannot be deactivated or demoted.'
  }

  return null
}

export async function changeOwnPassword(req, res) {
  try {
    const userId = parseUserId(req.session?.user?.userId)
    const { currentPassword, newPassword } = req.body || {}

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' })
    }

    if (typeof currentPassword !== 'string' || !currentPassword || typeof newPassword !== 'string' || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current and new passwords are required.' })
    }

    const account = await findPasswordHashByUserId(userId)
    if (!account) {
      return res.status(404).json({ success: false, message: 'User not found.' })
    }

    if (!(await bcrypt.compare(currentPassword, account.password_hash))) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect.' })
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ success: false, message: `New password must contain at least ${MIN_PASSWORD_LENGTH} characters.` })
    }

    if (await bcrypt.compare(newPassword, account.password_hash)) {
      return res.status(400).json({ success: false, message: 'New password must differ from the current password.' })
    }

    const passwordHash = await bcrypt.hash(newPassword, 10)
    await updateUserPassword(userId, passwordHash)

    return res.status(200).json({ success: true, message: 'Password changed successfully.' })
  } catch (error) {
    console.error('Change password error:', error)
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}

export async function resetUserPassword(req, res) {
  try {
    const userId = parseUserId(req.params.id)
    const { newPassword } = req.body || {}

    if (!userId) {
      return res.status(400).json({ success: false, message: 'Invalid user id.' })
    }
    if (typeof newPassword !== 'string' || !newPassword) {
      return res.status(400).json({ success: false, message: 'New password is required.' })
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ success: false, message: `New password must contain at least ${MIN_PASSWORD_LENGTH} characters.` })
    }

    const account = await findPasswordHashByUserId(userId)
    if (!account) {
      return res.status(404).json({ success: false, message: 'User not found.' })
    }
    if (await bcrypt.compare(newPassword, account.password_hash)) {
      return res.status(400).json({ success: false, message: 'New password must differ from the current password.' })
    }

    const passwordHash = await bcrypt.hash(newPassword, 10)
    await updateUserPassword(userId, passwordHash)

    return res.status(200).json({ success: true, message: 'User password reset successfully.' })
  } catch (error) {
    console.error('Reset user password error:', error)
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}

export async function createManagedUser(req, res) {
  const {
    role,
    firstName,
    lastName,
    email,
    password,
    username: requestedUsername,
    phone,
    rank,
    badgeNumber,
    stationId,
    designation,
    labId,
  } = req.body || {}

  if (!['Officer', 'Lab Technician'].includes(role)) {
    return res.status(400).json({
      success: false,
      message: 'Role must be Officer or Lab Technician.',
    })
  }

  const requiredValues = [firstName, lastName, email, password, phone]
  const requiredProfileValues = role === 'Officer'
    ? [rank, badgeNumber]
    : [designation]
  const roleValues = role === 'Officer'
    ? [rank, badgeNumber, stationId]
    : [designation, labId]

  if (
    requiredValues.some(value => typeof value !== 'string' || !value.trim()) ||
    requiredProfileValues.some(value => typeof value !== 'string' || !value.trim()) ||
    roleValues.some(value => value === undefined || value === null || value === '')
  ) {
    return res.status(400).json({
      success: false,
      message: 'Complete all required account and profile fields.',
    })
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({
      success: false,
      message: 'Password must contain at least 6 characters.',
    })
  }

  const emailAddress = email.trim().toLowerCase()
  const profileId = Number(role === 'Officer' ? stationId : labId)
  if (!Number.isInteger(profileId) || profileId <= 0) {
    return res.status(400).json({
      success: false,
      message: role === 'Officer' ? 'A valid police station is required.' : 'A valid laboratory is required.',
    })
  }

  let conn = null
  let transactionStarted = false

  try {
    const passwordHash = await bcrypt.hash(password, 10)
    conn = await pool.getConnection()
    await conn.beginTransaction()
    transactionStarted = true

    const [roleRows] = await conn.execute(
      'SELECT role_id FROM roles WHERE role_name = ? LIMIT 1',
      [role]
    )
    if (!roleRows[0]) {
      await conn.rollback()
      transactionStarted = false
      return res.status(400).json({ success: false, message: 'The selected role does not exist.' })
    }

    const parentTable = role === 'Officer' ? 'police_stations' : 'dna_labs'
    const parentColumn = role === 'Officer' ? 'station_id' : 'lab_id'
    const [parentRows] = await conn.execute(
      `SELECT ${parentColumn} FROM ${parentTable} WHERE ${parentColumn} = ? LIMIT 1`,
      [profileId]
    )
    if (!parentRows[0]) {
      await conn.rollback()
      transactionStarted = false
      return res.status(400).json({
        success: false,
        message: role === 'Officer' ? 'The specified police station does not exist.' : 'The specified laboratory does not exist.',
      })
    }

    const [emailRows] = await conn.execute(
      'SELECT user_id FROM users WHERE email = ? LIMIT 1',
      [emailAddress]
    )
    if (emailRows.length) {
      await conn.rollback()
      transactionStarted = false
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' })
    }

    const profileTable = role === 'Officer' ? 'officers' : 'lab_technicians'
    const [profileEmailRows] = await conn.execute(
      `SELECT 1 FROM ${profileTable} WHERE email = ? LIMIT 1`,
      [emailAddress]
    )
    if (profileEmailRows.length) {
      await conn.rollback()
      transactionStarted = false
      return res.status(409).json({
        success: false,
        message: role === 'Officer' ? 'An officer with this email already exists.' : 'A technician with this email already exists.',
      })
    }

    if (role === 'Officer') {
      const [badgeRows] = await conn.execute(
        'SELECT officer_id FROM officers WHERE station_id = ? AND badge_number = ? LIMIT 1',
        [profileId, badgeNumber.trim()]
      )
      if (badgeRows.length) {
        await conn.rollback()
        transactionStarted = false
        return res.status(409).json({ success: false, message: 'An officer with this badge number already exists at this station.' })
      }
    }

    const username = typeof requestedUsername === 'string' && requestedUsername.trim()
      ? requestedUsername.trim()
      : await generateUniqueUsername(firstName, lastName, conn)
    if (username.length > 100) {
      await conn.rollback()
      transactionStarted = false
      return res.status(400).json({ success: false, message: 'Username must be 100 characters or fewer.' })
    }
    const [usernameRows] = await conn.execute(
      'SELECT user_id FROM users WHERE username = ? LIMIT 1',
      [username]
    )
    if (usernameRows.length) {
      await conn.rollback()
      transactionStarted = false
      return res.status(409).json({ success: false, message: 'An account with this username already exists.' })
    }

    let officerId = null
    let technicianId = null

    if (role === 'Officer') {
      const [officerResult] = await conn.execute(
        `INSERT INTO officers
          (station_id, first_name, last_name, \`rank\`, badge_number, phone, email)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [profileId, firstName.trim(), lastName.trim(), rank.trim(), badgeNumber.trim(), phone.trim(), emailAddress]
      )
      officerId = officerResult.insertId
    } else {
      const [technicianResult] = await conn.execute(
        `INSERT INTO lab_technicians
          (lab_id, user_id, first_name, last_name, designation, phone, email)
         VALUES (?, NULL, ?, ?, ?, ?, ?)`,
        [profileId, firstName.trim(), lastName.trim(), designation.trim(), phone.trim(), emailAddress]
      )
      technicianId = technicianResult.insertId
    }

    const [userResult] = await conn.execute(
      `INSERT INTO users
        (role_id, officer_id, technician_id, username, password_hash, email, account_status)
       VALUES (?, ?, NULL, ?, ?, ?, 'pending_approval')`,
      [roleRows[0].role_id, officerId, username, passwordHash, emailAddress]
    )
    const userId = userResult.insertId

    if (technicianId) {
      await conn.execute(
        'UPDATE lab_technicians SET user_id = ? WHERE technician_id = ?',
        [userId, technicianId]
      )
    }

    await conn.commit()
    transactionStarted = false

    return res.status(201).json({
      success: true,
      message: `${role} account created successfully. Activate it to allow sign-in.`,
      user: {
        id: userId,
        username,
        email: emailAddress,
        role,
        officerId,
        technicianId,
        status: 'Pending Approval',
      },
    })
  } catch (error) {
    if (transactionStarted) await conn.rollback()
    console.error('Create user error:', error)

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'The email, username, or officer badge number is already in use.',
      })
    }
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ success: false, message: 'The selected station or laboratory does not exist.' })
    }

    return res.status(500).json({ success: false, message: 'Internal server error.' })
  } finally {
    conn?.release()
  }
}

export async function listUsers(req, res) {
  try {
    const search = req.query.search?.trim() || req.query.q?.trim() || ''
    const statusFilter = req.query.status?.trim() || ''

    const status = statusFilter === 'active'
      ? 'active'
      : statusFilter === 'inactive'
        ? 'inactive'
        : statusFilter === 'pending_approval' || statusFilter === 'pending'
          ? 'pending_approval'
          : parseStatus(statusFilter) || ''

    const users = await findAllUsers({
      search: search || undefined,
      status: status || undefined,
    })

    return res.status(200).json({
      success: true,
      users: users.map(formatUser),
    })
  } catch (error) {
    console.error('List users error:', error)

    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
    })
  }
}

export async function getUser(req, res) {
  try {
    const userId = parseUserId(req.params.id)

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user id.',
      })
    }

    const user = await findUserById(userId)

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      })
    }

    return res.status(200).json({
      success: true,
      user: formatUser(user),
    })
  } catch (error) {
    console.error('Get user error:', error)

    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
    })
  }
}

export async function updateUser(req, res) {
  try {
    const userId = parseUserId(req.params.id)

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user id.',
      })
    }

    const existing = await findUserById(userId)

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      })
    }

    const username = req.body.name?.trim() || req.body.username?.trim()
    const email = req.body.email?.trim()
    const roleName = req.body.role?.trim()

    if (!username || !email || !roleName) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and role are required.',
      })
    }

    if (!ALLOWED_ROLES.includes(roleName)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role.',
      })
    }

    const role = await findRoleByName(roleName)

    if (!role) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role.',
      })
    }

    if (roleName !== existing.role_name) {
      const lockoutError = await activeAdminRemovalError(req, existing)
      if (lockoutError) {
        return res.status(409).json({ success: false, message: lockoutError })
      }
    }

    if (await emailExists(email, userId)) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists.',
      })
    }

    if (await usernameExists(username, userId)) {
      return res.status(409).json({
        success: false,
        message: 'An account with this username already exists.',
      })
    }

    const updated = await updateUserById(userId, {
      username,
      email,
      roleId: role.role_id,
    })

    return res.status(200).json({
      success: true,
      message: 'User updated successfully.',
      user: formatUser(updated),
    })
  } catch (error) {
    console.error('Update user error:', error)

    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
    })
  }
}

export async function deleteUser(req, res) {
  try {
    const userId = parseUserId(req.params.id)

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user id.',
      })
    }

    const existing = await findUserById(userId)

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      })
    }

    const lockoutError = await activeAdminRemovalError(req, existing)
    if (lockoutError) {
      return res.status(409).json({ success: false, message: lockoutError })
    }

    const updated = await updateUserStatus(userId, 'inactive')

    return res.status(200).json({
      success: true,
      message: 'User deactivated successfully.',
      user: formatUser(updated),
    })
  } catch (error) {
    console.error('Delete user error:', error)

    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
    })
  }
}

export async function setUserStatus(req, res) {
  try {
    const userId = parseUserId(req.params.id)

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user id.',
      })
    }

    const existing = await findUserById(userId)

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      })
    }

    const accountStatus = parseStatus(req.body.status || req.body.account_status)

    if (!accountStatus || !ALLOWED_STATUSES.includes(accountStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Valid status is required.',
      })
    }

    if (accountStatus !== 'active') {
      const lockoutError = await activeAdminRemovalError(req, existing)
      if (lockoutError) {
        return res.status(409).json({ success: false, message: lockoutError })
      }
    }

    const updated = await updateUserStatus(userId, accountStatus)

    return res.status(200).json({
      success: true,
      message: 'User status updated successfully.',
      user: formatUser(updated),
    })
  } catch (error) {
    console.error('Update user status error:', error)

    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
    })
  }
}
