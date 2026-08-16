// Authentication remains browser-managed until a server identity provider is configured.
// Domain records are persisted separately by DataContext.
export const API_BASE_URL = 'http://localhost:8000/api'
export const REGISTERABLE_ROLES = ['Officer', 'Lab Technician']

const ACCOUNTS_KEY = 'forentrace-accounts-v2'
const SESSION_KEY = 'forentrace-session'
const seedAccounts = [
  { id: 'USR-01', name: 'System Administrator', email: 'admin@forentrace.gov.bd', password: 'admin123', role: 'Admin', initials: 'AD', status: 'Active', linked: 'System Administrator', lastLogin: '' },
  { id: 'USR-02', name: 'Md. Hasan', email: 'hasan@police.gov.bd', password: 'password', role: 'Officer', initials: 'MH', status: 'Active', linked: 'Md. Hasan', station: 'Dhanmondi Police Station', lastLogin: '' },
  { id: 'USR-03', name: 'Dr. Farah Khan', email: 'farah.khan@forentrace.gov.bd', password: 'password', role: 'Lab Technician', initials: 'FK', status: 'Active', linked: 'Dr. Farah Khan', lab: 'Dhaka Forensic DNA Lab', lastLogin: '' },
]

const normalizeEmail = email => email.trim().toLowerCase()
const accountInitials = name => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'FT'
const withoutPassword = ({ password: _password, ...account }) => account

function accounts() {
  try {
    const saved = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || 'null')
    if (Array.isArray(saved) && saved.length) return saved
  } catch { /* use seeded accounts */ }
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(seedAccounts))
  return seedAccounts
}
function saveAccounts(next) { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(next)); window.dispatchEvent(new Event('forentrace-accounts-changed')) }

export function getAccounts() { return accounts().map(withoutPassword) }
export function getSession() {
  try { const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); return session?.email && session?.role ? session : null } catch { return null }
}
export function login({ email, password }) {
  const account = accounts().find(item => item.email === normalizeEmail(email) && item.password === password)
  if (!account) throw new Error('Invalid email or password.')
  if (account.status !== 'Active') throw new Error(account.status === 'Pending Approval' ? 'This account is awaiting administrator approval.' : 'This account is inactive. Contact an administrator.')
  const user = { ...withoutPassword(account), lastLogin: new Date().toLocaleString() }
  saveAccounts(accounts().map(item => item.id === account.id ? { ...item, lastLogin: user.lastLogin } : item))
  localStorage.setItem(SESSION_KEY, JSON.stringify(user))
  return user
}
export function register({ name, email, password, role }) {
  const normalizedEmail = normalizeEmail(email)
  if (!REGISTERABLE_ROLES.includes(role)) throw new Error('Only Police Officers and Lab Technicians can register.')
  if (!name.trim() || !normalizedEmail || !password) throw new Error('Complete all registration fields.')
  if (password.length < 6) throw new Error('Password must contain at least 6 characters.')
  if (accounts().some(item => item.email === normalizedEmail)) throw new Error('An account with this email already exists.')
  const account = { id: `USR-${Date.now()}`, name: name.trim(), email: normalizedEmail, password, role, initials: accountInitials(name.trim()), status: 'Pending Approval', linked: '', lastLogin: '', station: '', lab: '' }
  saveAccounts([...accounts(), account])
  return withoutPassword(account)
}
export function updateAccount(id, values) {
  const current = accounts().find(item => item.id === id)
  if (!current) throw new Error('Account not found.')
  const next = { ...current, ...values, email: values.email ? normalizeEmail(values.email) : current.email, initials: values.name ? accountInitials(values.name) : current.initials }
  if (accounts().some(item => item.id !== id && item.email === next.email)) throw new Error('An account with this email already exists.')
  saveAccounts(accounts().map(item => item.id === id ? next : item))
  const session = getSession()
  if (session?.id === id) localStorage.setItem(SESSION_KEY, JSON.stringify(withoutPassword(next)))
  return withoutPassword(next)
}
export function changePassword(id, currentPassword, nextPassword) {
  const account = accounts().find(item => item.id === id)
  if (!account || account.password !== currentPassword) throw new Error('Your current password is incorrect.')
  if (nextPassword.length < 6) throw new Error('Password must contain at least 6 characters.')
  updateAccount(id, { password: nextPassword })
}
export function logout() { localStorage.removeItem(SESSION_KEY) }
