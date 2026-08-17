import api from './api'

export async function getUsers(params = {}) {
  const response = await api.get('/users', { params })
  return response.data.users
}

export async function getUserById(id) {
  const response = await api.get(`/users/${id}`)
  return response.data.user
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
