import 'dotenv/config'

export const PORT = Number(process.env.PORT) || 8000
export const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'
