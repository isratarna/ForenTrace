export const REGISTERABLE_ROLES = ['Officer', 'Lab Technician']

// Profile password change remains a frontend placeholder until a backend endpoint exists.
export function changePassword(_id, _currentPassword, _nextPassword) {
  throw new Error('Password changes are not available yet. Contact an administrator.')
}
