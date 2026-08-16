import { createContext, useContext, useEffect, useState } from 'react'
import { getSession, login, logout } from '../services/api'

const AuthContext = createContext(null)

export const dashboardPath = (role) => ({
  Admin: '/admin/dashboard',
  Officer: '/officer/dashboard',
  'Lab Technician': '/lab/dashboard',
}[role] || '/login')

export function RoleProvider({ children }) {
  const [user, setUser] = useState(getSession)

  useEffect(() => {
    const refresh = () => setUser(getSession())
    window.addEventListener('forentrace-accounts-changed', refresh)
    return () => window.removeEventListener('forentrace-accounts-changed', refresh)
  }, [])

  const signIn = (credentials) => {
    const authenticatedUser = login(credentials)
    setUser(authenticatedUser)
    return authenticatedUser
  }

  const signOut = () => {
    logout()
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, role: user?.role, signIn, signOut, refreshUser: () => setUser(getSession()) }}>{children}</AuthContext.Provider>
}

export const useRole = () => useContext(AuthContext)
