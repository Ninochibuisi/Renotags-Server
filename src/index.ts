import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'
import morgan from 'morgan'
import { connectMongoDB } from './config/mongodb.js'
import { errorHandler } from './middleware/errorHandler.js'
import { rateLimiter } from './middleware/rateLimiter.js'
import { logger, logInfo, logError } from './utils/logger.js'
import { validateEnv } from './utils/envValidator.js'
import './utils/crashHandler.js'
import onboardingRoutes from './routes/onboarding.js'
import adminRoutes from './routes/admin.js'
import userRoutes from './routes/user.js'
import authRoutes from './routes/auth.js'
import referralRoutes from './routes/referrals.js'
import taskRoutes from './routes/tasks.js'

dotenv.config()

try {
  validateEnv()
  logInfo('Environment variables validated successfully')
} catch (error) {
  logError('Environment validation failed', error)
  if (process.env.NODE_ENV === 'production') {
    process.exit(1)
  }
}

const app = express()
const PORT = process.env.PORT || 3001

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", process.env.FRONTEND_URL || 'http://localhost:5173'],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}))

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))

app.use(morgan('combined', {
  stream: {
    write: (message: string) => {
      logger.info(message.trim())
    },
  },
}))

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

app.use('/api/', rateLimiter)

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  })
})

app.use('/api/onboarding', onboardingRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/user', userRoutes)
app.use('/api/referrals', referralRoutes)
app.use('/api/tasks', taskRoutes)

app.use(errorHandler)

const startServer = async () => {
  try {
    await connectMongoDB()
    
    const server = app.listen(PORT, () => {
      logInfo(`🚀 Server running on port ${PORT}`)
      logInfo(`📧 Environment: ${process.env.NODE_ENV || 'development'}`)
      console.log(`🚀 Server running on port ${PORT}`)
      console.log(`📧 Environment: ${process.env.NODE_ENV || 'development'}`)
    })

    process.on('SIGTERM', () => {
      logInfo('SIGTERM received, shutting down gracefully...')
      server.close(() => {
        logInfo('HTTP server closed')
        process.exit(0)
      })
    })

    process.on('SIGINT', () => {
      logInfo('SIGINT received, shutting down gracefully...')
      server.close(() => {
        logInfo('HTTP server closed')
        process.exit(0)
      })
    })
  } catch (error) {
    logError('Failed to start server', error)
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}

startServer()
