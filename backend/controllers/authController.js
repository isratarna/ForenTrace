import bcrypt from 'bcrypt'

import {
  findUserByEmail,
  updateLastLogin,
} from '../models/userModel.js'

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