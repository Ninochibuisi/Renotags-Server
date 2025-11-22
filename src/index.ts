import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'
import morgan from 'morgan'
import mongoose from 'mongoose'
import { connectMongoDB } from './config/mongodb.js'
import { errorHandler } from './middleware/errorHandler.js'
import { rateLimiter } from './middleware/rateLimiter.js'
import { logger, logInfo, logError, logWarn } from './utils/logger.js'
import { validateEnv } from './utils/envValidator.js'
import './utils/crashHandler.js'
import onboardingRoutes from './routes/onboarding.js'
import adminRoutes from './routes/admin.js'
import userRoutes from './routes/user.js'
import authRoutes from './routes/auth.js'
import referralRoutes from './routes/referrals.js'
import taskRoutes from './routes/tasks.js'
import { emailService } from './services/emailService.js'

// Load environment variables first
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

// Normalize FRONTEND_URL (remove trailing slash)
const frontendUrl = process.env.FRONTEND_URL?.replace(/\/$/, '') || 'http://localhost:5173'

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", frontendUrl],
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
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true)
    
    // Normalize origin (remove trailing slash)
    const normalizedOrigin = origin.replace(/\/$/, '')
    const normalizedFrontendUrl = frontendUrl.replace(/\/$/, '')
    
    // Allow exact match, localhost for development, or vercel.app domains
    if (
      normalizedOrigin === normalizedFrontendUrl || 
      normalizedOrigin.includes('localhost') ||
      normalizedOrigin.includes('vercel.app') ||
      normalizedOrigin.includes('127.0.0.1')
    ) {
      callback(null, true)
    } else {
      logWarn('CORS blocked request', { origin, frontendUrl })
      callback(new Error('Not allowed by CORS'))
    }
  },
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

app.get('/health', async (req, res) => {
  try {
    // Check MongoDB connection
    const mongoStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    
    // Ping MongoDB to verify it's actually working
    let mongoPing = false
    let dbName = 'unknown'
    
    if (mongoStatus === 'connected' && mongoose.connection.db) {
      try {
        await mongoose.connection.db.admin().ping()
        mongoPing = true
        dbName = mongoose.connection.db.databaseName
      } catch (error) {
        mongoPing = false
      }
    }

    const health = {
      status: mongoPing ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        status: mongoStatus,
        ping: mongoPing,
        name: dbName,
      },
    }

    res.status(mongoPing ? 200 : 503).json(health)
  } catch (error) {
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      error: 'Health check failed',
    })
  }
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
    
    // Test email service on startup
    if (process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      logInfo('Email service configuration detected', {
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT || '587',
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      })
    } else {
      logWarn('Email service not configured - email sending will be disabled', {
        missing: [
          !process.env.EMAIL_HOST && 'EMAIL_HOST',
          !process.env.EMAIL_USER && 'EMAIL_USER',
          !process.env.EMAIL_PASS && 'EMAIL_PASS',
        ].filter(Boolean).join(', '),
      })
    }
    
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
