import bcrypt from 'bcrypt'
import {
  findUserByEmail,
  updateLastLogin,
} from '../models/userModel.js'
import { findAllStations } from '../models/policeStationModel.js'
import { getAllLabs } from '../models/dnaLabModel.js'
import { createManagedUser } from './userController.js'

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

    // 1. Session Storage:
    // Storing authenticated user data on `req.session`.
    // Express-session saves this data server-side and automatically sends a signed
    // session identifier cookie (`connect.sid`) to the client in the HTTP response headers.
    req.session.user = {
      userId: user.user_id,
      username: user.username,
      email: user.email,
      roleId: user.role_id,
      role: user.role_name,
      officerId: user.officer_id,
      technicianId: user.technician_id,
    }

    // 2. Track activity in database
    await updateLastLogin(user.user_id)

    // 3. Return sanitized session user payload to frontend
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
// When the client makes a request with the `connect.sid` cookie,
// express-session automatically restores `req.session.user`.
export function getCurrentUser(req, res) {
  return res.status(200).json({
    success: true,
    user: req.session.user,
  })
}
// Clears the session from the server store and deletes the cookie from the browser.
export function logout(req, res) {
  req.session.destroy((error) => {
    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Logout failed.',
      })
    }

    // Instructs the browser to remove the session cookie
    res.clearCookie('connect.sid')

    return res.status(200).json({
      success: true,
      message: 'Logout successful.',
    })
  })
}

// Public self-registration (Police Officer / Lab Technician).
// Admin er createManagedUser er same validation + transaction reuse kora hocche,
// tai profile (officers / lab_technicians) ar users row eksathe toiri hoy.
// Account shob shomoy 'pending_approval' thake — admin approve na kora porjonto login hobe na.
// createManagedUser nije e role ke Officer / Lab Technician e limit kore, tai Admin register kora jabe na.
export function register(req, res) {
  // Username nije dite parbe na — first + last name theke auto generate hobe
  const { username, ...body } = req.body || {}
  req.body = body
  return createManagedUser(req, res)
}

// Register form er dropdown er jonno station ar lab list (login chara).
// Shudhu id ar name pathano hocche, baki station/lab details public kora hocche na.
export async function getRegisterOptions(req, res) {
  try {
    const [stations, labs] = await Promise.all([findAllStations(), getAllLabs()])

    return res.status(200).json({
      success: true,
      stations: stations.map(station => ({
        id: station.station_id,
        name: station.station_name,
      })),
      labs: labs.map(lab => ({
        id: lab.lab_id,
        name: lab.lab_name,
      })),
    })
  } catch (error) {
    console.error('Register options error:', error)

    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
    })
  }
}
