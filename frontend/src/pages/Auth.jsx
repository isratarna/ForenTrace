import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'

import { useAuth } from '../context/AuthContext'
import { registerUser, registerOfficer } from '../services/authService'
import { getStations } from '../services/policeStationService'
import { useData } from '../data/DataContext'
import { dashboardPath } from '../utils/auth'

export const REGISTERABLE_ROLES = ['Officer', 'Lab Technician']

export default function Login() {
  const { user, login } = useAuth()
  const { data } = useData()
  const navigate = useNavigate()

  const [mode, setMode] = useState('login')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [stationRows, setStationRows] = useState(data.stations)

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'Officer',
  })

  const [officerForm, setOfficerForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    rank: '',
    badgeNumber: '',
    phone: '',
    station: '',
  })

  useEffect(() => {
    let ignore = false

    async function loadStations() {
      try {
        const stations = await getStations()
        if (!ignore) setStationRows(stations)
      } catch {
        if (!ignore) setStationRows(data.stations)
      }
    }

    loadStations()

    return () => {
      ignore = true
    }
  }, [data.stations])

  if (user) {
    return (
      <Navigate
        to={dashboardPath(user.role)}
        replace
      />
    )
  }

  const update = (event) =>
    setForm(current => ({
      ...current,
      [event.target.name]: event.target.value,
    }))

  const updateOfficerField = (event) =>
    setOfficerForm(current => ({
      ...current,
      [event.target.name]: event.target.value,
    }))

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setNotice('')

    try {
      if (mode === 'register') {
        await registerUser(form)

        setNotice(
          'Registration submitted. An administrator must approve your account before you can sign in.'
        )

        setMode('login')
        return
      }

      if (mode === 'register-officer') {
        const selectedStation = stationRows.find(s => s.name === officerForm.station)
        let stationId = selectedStation?.stationId || selectedStation?.station_id
        if (!stationId && selectedStation?.id) {
          const numMatch = String(selectedStation.id).match(/\d+/)
          stationId = numMatch ? parseInt(numMatch[0], 10) : null
        }

        await registerOfficer({
          firstName: officerForm.firstName,
          lastName: officerForm.lastName,
          email: officerForm.email,
          password: officerForm.password,
          rank: officerForm.rank,
          badgeNumber: officerForm.badgeNumber,
          phone: officerForm.phone || null,
          stationId: stationId,
        })

        setNotice(
          'Officer registration submitted. An administrator must approve your account before you can sign in.'
        )

        setMode('login')
        return
      }

      const emailToUse = form.email
      const passwordToUse = form.password

      const authenticatedUser = await login(
        emailToUse,
        passwordToUse
      )

      navigate(
        dashboardPath(authenticatedUser.role),
        { replace: true }
      )
    } catch (submissionError) {
      setError(
        submissionError.response?.data?.message ||
        submissionError.message ||
        'Authentication failed.'
      )
    }
  }

  const changeMode = (nextMode) => {
    setError('')
    setNotice('')
    setMode(nextMode)
  }

  return (
    <main className="login-page">
      <section className="login-brand">
        <div className="brand-icon large">FT</div>
        <h1>ForenTrace</h1>
        <p>DNA Identification System</p>
        <hr />
        <p className="small">
          Centralized management for missing-person investigations,
          forensic DNA samples, and identification records.
        </p>
      </section>

      <section className="login-form-wrap">
        <form className="login-card" onSubmit={submit}>
          <span className="eyebrow">AUTHORIZED ACCESS</span>

          <h2>
            {mode === 'login'
              ? 'Sign in to ForenTrace'
              : mode === 'register-officer'
                ? 'Register as Police Officer'
                : 'Create an authorized account'}
          </h2>

          <p className="text-secondary">
            {mode === 'login'
              ? 'Sign in using your registered email address and password.'
              : mode === 'register-officer'
                ? 'Provide your department credentials to register an officer profile.'
                : 'Registration is available only for Police Officers and Lab Technicians.'}
          </p>

          {error && (
            <div className="alert alert-danger py-2" role="alert">
              {error}
            </div>
          )}

          {notice && (
            <div className="alert alert-success py-2" role="status">
              {notice}
            </div>
          )}

          {mode === 'register-officer' && (
            <>
              <label className="form-label" htmlFor="firstName">
                First Name
              </label>
              <input
                id="firstName"
                className="form-control mb-3"
                name="firstName"
                value={officerForm.firstName}
                onChange={updateOfficerField}
                required
              />

              <label className="form-label" htmlFor="lastName">
                Last Name
              </label>
              <input
                id="lastName"
                className="form-control mb-3"
                name="lastName"
                value={officerForm.lastName}
                onChange={updateOfficerField}
                required
              />

              <label className="form-label" htmlFor="rank">
                Rank
              </label>
              <input
                id="rank"
                className="form-control mb-3"
                name="rank"
                value={officerForm.rank}
                onChange={updateOfficerField}
                required
              />

              <label className="form-label" htmlFor="badgeNumber">
                Badge Number
              </label>
              <input
                id="badgeNumber"
                className="form-control mb-3"
                name="badgeNumber"
                value={officerForm.badgeNumber}
                onChange={updateOfficerField}
                required
              />

              <label className="form-label" htmlFor="phone">
                Phone (Optional)
              </label>
              <input
                id="phone"
                className="form-control mb-3"
                name="phone"
                value={officerForm.phone}
                onChange={updateOfficerField}
              />

              <label className="form-label" htmlFor="station">
                Police Station
              </label>
              <select
                id="station"
                className="form-select mb-3"
                name="station"
                value={officerForm.station}
                onChange={updateOfficerField}
                required
              >
                <option value="">Select Police Station</option>
                {stationRows.map(station => (
                  <option key={station.id || station.stationId || station.station_id} value={station.name}>
                    {station.name}
                  </option>
                ))}
              </select>

              <label className="form-label" htmlFor="officerEmail">
                Email
              </label>
              <input
                id="officerEmail"
                className="form-control mb-3"
                name="email"
                type="email"
                value={officerForm.email}
                onChange={updateOfficerField}
                autoComplete="email"
                required
              />

              <label className="form-label" htmlFor="officerPassword">
                Password
              </label>
              <input
                id="officerPassword"
                className="form-control mb-4"
                name="password"
                type="password"
                value={officerForm.password}
                onChange={updateOfficerField}
                autoComplete="new-password"
                required
              />
            </>
          )}

          {(mode === 'login' || mode === 'register') && (
            <>
              {mode === 'register' && (
                <>
                  <label className="form-label" htmlFor="name">
                    Full name
                  </label>

                  <input
                    id="name"
                    className="form-control mb-3"
                    name="name"
                    value={form.name}
                    onChange={update}
                    required
                  />

                  <label className="form-label" htmlFor="role">
                    Role
                  </label>

                  <select
                    id="role"
                    className="form-select mb-3"
                    name="role"
                    value={form.role}
                    onChange={update}
                  >
                    {REGISTERABLE_ROLES.map(role => (
                      <option key={role} value={role}>
                        {role === 'Officer'
                          ? 'Police Officer'
                          : role}
                      </option>
                    ))}
                  </select>
                </>
              )}

              <label className="form-label" htmlFor="email">
                Email
              </label>

              <input
                id="email"
                className="form-control mb-3"
                name="email"
                type="email"
                value={form.email}
                onChange={update}
                autoComplete="email"
                required
              />

              <label className="form-label" htmlFor="password">
                Password
              </label>

              <input
                id="password"
                className="form-control mb-4"
                name="password"
                type="password"
                value={form.password}
                onChange={update}
                autoComplete={
                  mode === 'login'
                    ? 'current-password'
                    : 'new-password'
                }
                required
              />
            </>
          )}

          <button className="btn btn-primary w-100">
            {mode === 'login'
              ? 'Sign in'
              : 'Create account'}
          </button>

          <div className="text-secondary small text-center mt-4 mb-0">
            {mode === 'login' ? (
              <div className="d-flex flex-column gap-2 align-items-center">
                <span>
                  Need an account?{' '}
                  <Link
                    to="#"
                    onClick={event => {
                      event.preventDefault()
                      changeMode('register')
                    }}
                  >
                    Register as an officer or lab technician
                  </Link>
                </span>
                <span>
                  or{' '}
                  <Link
                    to="#"
                    onClick={event => {
                      event.preventDefault()
                      changeMode('register-officer')
                    }}
                  >
                    Register as Police Officer (Detailed)
                  </Link>
                </span>
              </div>
            ) : (
              <>
                Already have an account?{' '}
                <Link
                  to="#"
                  onClick={event => {
                    event.preventDefault()
                    changeMode('login')
                  }}
                >
                  Sign in
                </Link>
              </>
            )}
          </div>

          {mode === 'login' && (
            <p className="text-secondary small text-center mt-3 mb-0">
              Admin accounts are predefined and cannot be registered.
            </p>
          )}
        </form>
      </section>
    </main>
  )
}
