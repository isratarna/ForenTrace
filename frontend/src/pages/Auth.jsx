import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

import { useAuth } from '../context/AuthContext'
import { getRegisterOptions, registerAccount } from '../services/authService'
import { dashboardPath } from '../utils/auth'
import { DnaHelix } from '../components/DnaEffects' // DNA animation (UI upgrade)

// Register form er khali value — mode change korle form reset hoy
const EMPTY_REGISTER_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  password: '',
  rank: '',
  badgeNumber: '',
  stationId: '',
  designation: '',
  labId: '',
}

export default function Login() {
  const { user, login } = useAuth()
  const navigate = useNavigate()

  // mode: 'login', 'Officer' ba 'Lab Technician' (register er role)
  const [mode, setMode] = useState('login')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState({
    email: '',
    password: '',
  })
  const [registerForm, setRegisterForm] = useState(EMPTY_REGISTER_FORM)
  const [options, setOptions] = useState({ stations: [], labs: [] })

  const registering = mode !== 'login'

  // Register mode e gele station ar lab dropdown er list load hoy
  useEffect(() => {
    if (!registering) return undefined

    let ignore = false

    getRegisterOptions()
      .then(result => {
        if (!ignore) setOptions({ stations: result.stations, labs: result.labs })
      })
      .catch(() => {
        if (!ignore) setError('Could not load police stations and laboratories.')
      })

    return () => {
      ignore = true
    }
  }, [registering])

  if (user) {
    return (
      <Navigate
        to={dashboardPath(user.role)}
        replace
      />
    )
  }

  const update = event =>
    setForm(current => ({
      ...current,
      [event.target.name]: event.target.value,
    }))

  const updateRegister = event =>
    setRegisterForm(current => ({
      ...current,
      [event.target.name]: event.target.value,
    }))

  const changeMode = nextMode => {
    setMode(nextMode)
    setError('')
    setNotice('')
    setRegisterForm(EMPTY_REGISTER_FORM)
  }

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setNotice('')

    try {
      if (registering) {
        // Role onujayi shudhu dorkari profile field pathano hoy
        await registerAccount({
          role: mode,
          firstName: registerForm.firstName,
          lastName: registerForm.lastName,
          email: registerForm.email,
          phone: registerForm.phone,
          password: registerForm.password,
          ...(mode === 'Officer'
            ? {
                rank: registerForm.rank,
                badgeNumber: registerForm.badgeNumber,
                stationId: registerForm.stationId,
              }
            : {
                designation: registerForm.designation,
                labId: registerForm.labId,
              }),
        })

        changeMode('login')
        setNotice(
          'Registration submitted. An administrator must approve your account before you can sign in.'
        )
        return
      }

      const authenticatedUser = await login(
        form.email,
        form.password
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

  // Register form er ekta text input — label + input eksathe
  const registerField = (name, label, type = 'text', autoComplete = 'off') => (
    <div className="col-md-6">
      <label className="form-label" htmlFor={`register-${name}`}>
        {label}
      </label>
      <input
        id={`register-${name}`}
        className="form-control"
        name={name}
        type={type}
        value={registerForm[name]}
        onChange={updateRegister}
        autoComplete={autoComplete}
        required
      />
    </div>
  )

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
        {/* Boro ghurte thaka DNA helix — login page er decoration (UI upgrade) */}
        <DnaHelix rungs={10} size="large" />
      </section>

      <section className="login-form-wrap">
        <form className="login-card" onSubmit={submit}>
          <span className="eyebrow">
            {registering ? 'ACCOUNT REQUEST' : 'AUTHORIZED ACCESS'}
          </span>

          <h2>
            {mode === 'login'
              ? 'Sign in to ForenTrace'
              : mode === 'Officer'
                ? 'Register as Police Officer'
                : 'Register as Lab Technician'}
          </h2>

          <p className="text-secondary">
            {registering
              ? 'Your account will be reviewed by an administrator before you can sign in.'
              : 'Sign in using your registered email address and password.'}
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

          {registering ? (
            <div className="row g-3 mb-4">
              {registerField('firstName', 'First name', 'text', 'given-name')}
              {registerField('lastName', 'Last name', 'text', 'family-name')}
              {registerField('email', 'Email', 'email', 'email')}
              {registerField('phone', 'Phone', 'tel', 'tel')}

              {mode === 'Officer' ? (
                <>
                  {registerField('rank', 'Rank')}
                  {registerField('badgeNumber', 'Badge number')}
                  <div className="col-12">
                    <label className="form-label" htmlFor="register-stationId">
                      Police station
                    </label>
                    <select
                      id="register-stationId"
                      className="form-select"
                      name="stationId"
                      value={registerForm.stationId}
                      onChange={updateRegister}
                      required
                    >
                      <option value="">Select station</option>
                      {options.stations.map(station => (
                        <option key={station.id} value={station.id}>
                          {station.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  {registerField('designation', 'Designation')}
                  <div className="col-md-6">
                    <label className="form-label" htmlFor="register-labId">
                      Laboratory
                    </label>
                    <select
                      id="register-labId"
                      className="form-select"
                      name="labId"
                      value={registerForm.labId}
                      onChange={updateRegister}
                      required
                    >
                      <option value="">Select laboratory</option>
                      {options.labs.map(lab => (
                        <option key={lab.id} value={lab.id}>
                          {lab.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <div className="col-12">
                <label className="form-label" htmlFor="register-password">
                  Password
                </label>
                <input
                  id="register-password"
                  className="form-control"
                  name="password"
                  type="password"
                  value={registerForm.password}
                  onChange={updateRegister}
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </div>
            </div>
          ) : (
            <>
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
                autoComplete="current-password"
                required
              />
            </>
          )}

          <button className="btn btn-primary w-100">
            {registering ? 'Submit registration' : 'Sign in'}
          </button>

          {/* Login ↔ register mode switch */}
          <div className="text-secondary small text-center mt-4 mb-0">
            {registering ? (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  className="btn btn-link btn-sm p-0 align-baseline"
                  onClick={() => changeMode('login')}
                >
                  Sign in
                </button>
              </>
            ) : (
              <div className="d-flex flex-column gap-2 align-items-center">
                <span>Need an account?</span>
                <button
                  type="button"
                  className="btn btn-link btn-sm p-0"
                  onClick={() => changeMode('Officer')}
                >
                  Register as Police Officer
                </button>
                <button
                  type="button"
                  className="btn btn-link btn-sm p-0"
                  onClick={() => changeMode('Lab Technician')}
                >
                  Register as Lab Technician
                </button>
              </div>
            )}
          </div>

          {!registering && (
            <p className="text-secondary small text-center mt-3 mb-0">
              Admin accounts are predefined and cannot be registered.
            </p>
          )}
        </form>
      </section>
    </main>
  )
}
