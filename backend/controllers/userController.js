import {
  findAllUsers,
  findUserById,
  findRoleByName,
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

export function formatUser(row) {
  if (!row) return null

  return {
    id: row.user_id,
    name: row.username,
    email: row.email,
    role: row.role_name,
    linked: '—',
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
