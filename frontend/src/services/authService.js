import api from './api'

export async function loginUser(email, password) {
  const response = await api.post('/auth/login', {
    email,
    password,
  })

  return response.data
}

export async function getCurrentUser() {
  const response = await api.get('/auth/me')
  return response.data
}

export async function logoutUser() {
  const response = await api.post('/auth/logout')
  return response.data
}

// Officer / Lab Technician self-registration — admin approve korar por login kora jabe
export async function registerAccount(data) {
  const response = await api.post('/auth/register', data)
  return response.data
}

// Register form er station ar lab dropdown (login chara pawa jay)
export async function getRegisterOptions() {
  const response = await api.get('/auth/register/options')
  return response.data
}
