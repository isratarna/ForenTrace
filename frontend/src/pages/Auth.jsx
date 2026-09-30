import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

import { useAuth } from '../context/AuthContext'
import { dashboardPath } from '../utils/auth'
import { DnaHelix } from '../components/DnaEffects' // DNA animation (UI upgrade)

export default function Login() {
  const { user, login } = useAuth()
  const navigate = useNavigate()

  const [error, setError] = useState('')
  const [form, setForm] = useState({
    email: '',
    password: '',
  })

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

  const submit = async (event) => {
    event.preventDefault()
    setError('')

    try {
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
          <span className="eyebrow">AUTHORIZED ACCESS</span>

          <h2>Sign in to ForenTrace</h2>

          <p className="text-secondary">
            Sign in using your registered email address and password.
          </p>

          {error && (
            <div className="alert alert-danger py-2" role="alert">
              {error}
            </div>
          )}

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

          <button className="btn btn-primary w-100">
            Sign in
          </button>

          <p className="text-secondary small text-center mt-4 mb-0">
            Operational accounts are created by an administrator.
          </p>
        </form>
      </section>
    </main>
  )
}
