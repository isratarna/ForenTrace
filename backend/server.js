import express from 'express'
import cors from 'cors'

import { FRONTEND_URL, PORT } from './config/env.js'
import { testDatabaseConnection } from './config/db.js'
import healthRoutes from './routes/healthRoutes.js'

const app = express()

app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
)

app.use(express.json())

app.use('/api/health', healthRoutes)

async function startServer() {
  try {
    await testDatabaseConnection()
    console.log('MySQL connection successful.')

    app.listen(PORT, () => {
      console.log(`ForenTrace API listening on http://localhost:${PORT}`)
    })
  } catch (error) {
    console.error('MySQL connection failed:', error.message)
    process.exit(1)
  }
}

startServer()