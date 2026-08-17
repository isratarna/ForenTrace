import bcrypt from 'bcrypt'

import {
  findUserByEmail,
  findRoleByName,
  emailExists,
  usernameExists,
  createUser,
  updateLastLogin,
} from '../models/userModel.js'

const REGISTERABLE_ROLES = ['Officer', 'Lab Technician']

export async function login(req, res) {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.',
      })
    }

    const user = await findUserByEmail(email)

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      })
    }

    if (user.account_status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Account is not active.',
      })
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash
    )

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      })
    }

    req.session.user = {
      userId: user.user_id,
      username: user.username,
      email: user.email,
      roleId: user.role_id,
      role: user.role_name,
      officerId: user.officer_id,
      technicianId: user.technician_id,
    }

    await updateLastLogin(user.user_id)

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      user: req.session.user,
    })
  } catch (error) {
    console.error('Login error:', error)

    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
    })
  }
}
export async function register(req, res) {
  try {
    const { name, email, password, role } = req.body
    const username = name?.trim()
    const normalizedEmail = email?.trim().toLowerCase()

    if (!username || !normalizedEmail || !password || !role) {
      return res.status(400).json({
        success: false,
        message: 'Complete all registration fields.',
      })
    }

    if (!REGISTERABLE_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Only Police Officers and Lab Technicians can register.',
      })
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must contain at least 6 characters.',
      })
    }

    const roleRecord = await findRoleByName(role)

    if (!roleRecord) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role.',
      })
    }

    if (await emailExists(normalizedEmail)) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists.',
      })
    }

    if (await usernameExists(username)) {
      return res.status(409).json({
        success: false,
        message: 'An account with this username already exists.',
      })
    }

    const passwordHash = await bcrypt.hash(password, 10)

    await createUser({
      username,
      email: normalizedEmail,
      passwordHash,
      roleId: roleRecord.role_id,
      accountStatus: 'pending_approval',
    })

    return res.status(201).json({
      success: true,
      message:
        'Registration submitted. An administrator must approve your account before you can sign in.',
    })
  } catch (error) {
    console.error('Register error:', error)

    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
    })
  }
}

export function getCurrentUser(req, res) {
  return res.status(200).json({
    success: true,
    user: req.session.user,
  })
}
export function logout(req, res) {
  req.session.destroy((error) => {
    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Logout failed.',
      })
    }

    res.clearCookie('connect.sid')

    return res.status(200).json({
      success: true,
      message: 'Logout successful.',
    })
  })
}