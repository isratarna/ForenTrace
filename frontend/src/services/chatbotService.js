import api from './api'

export async function askChatbot(question, history = []) {
  const response = await api.post('/chatbot/ask', { question, history })
  return response.data
}
