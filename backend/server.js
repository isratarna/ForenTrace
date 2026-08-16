import express from 'express'
import cors from 'cors'
import { FRONTEND_URL, PORT } from './config/env.js'
import healthRoutes from './routes/healthRoutes.js'

const app = express()

app.use(cors({
  origin: FRONTEND_URL,
  credentials: true,
}))
app.use(express.json())

app.use('/api/health', healthRoutes)

app.listen(PORT, () => {
  console.log(`ForenTrace API listening on http://localhost:${PORT}`)
})
