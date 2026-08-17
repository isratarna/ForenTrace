import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'

import { useAuth } from '../context/AuthContext'
import { registerUser } from '../services/authService'
import { dashboardPath } from '../utils/auth'

export const REGISTERABLE_ROLES = ['Officer', 'Lab Technician']

export default function Login() {
  const { user, login } = useAuth()
  const navigate = useNavigate()

  const [mode, setMode] = useState('login')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'Officer',
  })

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
        'Login failed.'
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
              : 'Create an authorized account'}
          </h2>

          <p className="text-secondary">
            {mode === 'login'
              ? 'Sign in using your registered email address and password.'
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

          <button className="btn btn-primary w-100">
            {mode === 'login'
              ? 'Sign in'
              : 'Create account'}
          </button>

          <p className="text-secondary small text-center mt-4 mb-0">
            {mode === 'login' ? (
              <>
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
              </>
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
          </p>

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