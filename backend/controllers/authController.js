import bcrypt from 'bcrypt'
import pool from '../config/db.js'
import {
  findUserByEmail,
  findRoleByName,
  emailExists,
  usernameExists,
  createUser,
  updateLastLogin,
} from '../models/userModel.js'
import { badgeNumberExists, emailExistsInOfficers } from '../models/officerModel.js'

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

export async function registerOfficer(req, res) {
  try {
    const { firstName, lastName, email, password, rank, badgeNumber, phone, stationId } = req.body

    if (
      !firstName?.trim() ||
      !lastName?.trim() ||
      !email?.trim() ||
      !password ||
      !rank?.trim() ||
      !badgeNumber?.trim() ||
      !stationId
    ) {
      return res.status(400).json({
        success: false,
        message: 'Complete all required registration fields.',
      })
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must contain at least 6 characters.',
      })
    }

    // Verify station exists
    const [stationRows] = await pool.execute(
      'SELECT station_id FROM police_stations WHERE station_id = ? LIMIT 1',
      [stationId]
    )
    if (stationRows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'The specified police station does not exist.',
      })
    }

    const username = `${firstName.trim()} ${lastName.trim()}`
    const normalizedEmail = email.trim().toLowerCase()

    // Uniqueness checks
    if (await emailExists(normalizedEmail)) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists in users.',
      })
    }

    if (await usernameExists(username)) {
      return res.status(409).json({
        success: false,
        message: 'An account with this username already exists in users.',
      })
    }

    if (await emailExistsInOfficers(normalizedEmail)) {
      return res.status(409).json({
        success: false,
        message: 'An officer with this email already exists.',
      })
    }

    if (await badgeNumberExists(badgeNumber)) {
      return res.status(409).json({
        success: false,
        message: 'An officer with this badge number already exists.',
      })
    }

    const accountStatus = 'pending_approval'

    // Perform transaction
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      // 1. Insert into officers
      const [officerResult] = await conn.execute(
        `INSERT INTO officers (station_id, first_name, last_name, \`rank\`, badge_number, phone, email)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          stationId,
          firstName.trim(),
          lastName.trim(),
          rank.trim(),
          badgeNumber.trim(),
          phone?.trim() || null,
          normalizedEmail,
        ]
      )
      const officerId = officerResult.insertId

      // 2. Hash password
      const passwordHash = await bcrypt.hash(password, 10)

      // 3. Find role_id for 'Officer'
      const [roleRows] = await conn.execute(
        'SELECT role_id FROM roles WHERE role_name = ? LIMIT 1',
        ['Officer']
      )
      const roleId = roleRows[0]?.role_id

      if (!roleId) {
        throw new Error('Officer role not found in database.')
      }

      // 4. Insert into users linked to the new officer
      await conn.execute(
        `INSERT INTO users (role_id, officer_id, technician_id, username, password_hash, email, account_status)
         VALUES (?, ?, NULL, ?, ?, ?, ?)`,
        [
          roleId,
          officerId,
          username,
          passwordHash,
          normalizedEmail,
          accountStatus,
        ]
      )

      await conn.commit()
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }

    return res.status(201).json({
      success: true,
      message: 'Officer registration submitted successfully. An administrator must approve your account before you can sign in.',
    })
  } catch (error) {
    console.error('Register officer error:', error)
    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
    })
  }
}