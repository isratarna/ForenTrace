export function userInitials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase() || 'FT'
}

export function normalizeUser(backendUser) {
  if (!backendUser) return null

  const name = backendUser.username || backendUser.name || backendUser.email || ''

  return {
    ...backendUser,
    id: backendUser.userId ?? backendUser.id,
    name,
    initials: backendUser.initials || userInitials(name),
    status:
      backendUser.status ||
      (backendUser.account_status === 'active'
        ? 'Active'
        : backendUser.account_status) ||
      'Active',
  }
}

export function dashboardPath(role) {
  if (role === 'Admin') return '/admin/dashboard'
  if (role === 'Officer') return '/officer/dashboard'
  if (role === 'Lab Technician') return '/lab/dashboard'
  return '/login'
}
