import express from 'express'
import cors from 'cors'
import session from 'express-session'

import { FRONTEND_URL, PORT, SESSION_SECRET } from './config/env.js'
import { testDatabaseConnection } from './config/db.js'

import healthRoutes from './routes/healthRoutes.js'
import authRoutes from './routes/authRoutes.js'
import userRoutes from './routes/userRoutes.js'
import officerRoutes from './routes/officerRoutes.js'
import policeStationRoutes from './routes/policeStationRoutes.js'
import caseRoutes from './routes/caseRoutes.js'

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
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24,
    },
  })
)

app.use('/api/health', healthRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/officers', officerRoutes)
app.use('/api/police-stations', policeStationRoutes)
app.use('/api/cases', caseRoutes)

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
