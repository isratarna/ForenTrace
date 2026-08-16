import express from 'express'
import cors from 'cors'
import session from 'express-session'

import { FRONTEND_URL, PORT, SESSION_SECRET } from './config/env.js'
import { testDatabaseConnection } from './config/db.js'

import healthRoutes from './routes/healthRoutes.js'
import authRoutes from './routes/authRoutes.js'

const app = express()

app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
)

app.use(express.json())

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,
    },
  })
)

app.use('/api/health', healthRoutes)
app.use('/api/auth', authRoutes)

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