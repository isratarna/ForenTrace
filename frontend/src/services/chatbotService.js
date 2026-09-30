import api from './api'

export async function askChatbot(question) {
  const response = await api.post('/chatbot/ask', { question })
  return response.data
}
