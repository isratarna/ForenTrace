import api from './api'

export async function getUsers(params = {}) {
  const response = await api.get('/users', { params })
  return response.data.users
}

export async function getUserById(id) {
  const response = await api.get(`/users/${id}`)
  return response.data.user
}

export async function createManagedUser(values) {
  const response = await api.post('/users/create', values)
  return response.data
}

export async function changeOwnPassword(currentPassword, newPassword) {
  const response = await api.put('/users/password', {
    currentPassword,
    newPassword,
  })

  return response.data
}

export async function resetUserPassword(id, newPassword) {
  const response = await api.put(`/users/${id}/password/reset`, { newPassword })
  return response.data
}

export async function updateUser(id, values) {
  const response = await api.put(`/users/${id}`, {
    name: values.name,
    email: values.email,
    role: values.role,
  })

  return response.data.user
}

export async function updateUserStatus(id, status) {
  const response = await api.put(`/users/${id}/status`, { status })
  return response.data.user
}

export async function deleteUser(id) {
  const response = await api.delete(`/users/${id}`)
  return response.data.user
}
