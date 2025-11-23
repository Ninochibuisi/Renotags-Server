import mongoose from 'mongoose'
import { logInfo, logWarn, logError } from '../utils/logger.js'

const MAX_RETRIES = 5
const INITIAL_RETRY_DELAY = 2000 // 2 seconds
const MAX_RETRY_DELAY = 30000 // 30 seconds

const delay = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export const connectMongoDB = async (): Promise<void> => {
  const mongoUri = process.env.MONGODB_URI
  
  if (!mongoUri) {
    throw new Error('MONGODB_URI is not defined in environment variables')
  }

  const isProduction = process.env.NODE_ENV === 'production'
  let lastError: Error | null = null

  // Retry logic with exponential backoff
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logInfo(`Attempting MongoDB connection (attempt ${attempt}/${MAX_RETRIES})...`, {
        host: mongoUri.split('@')[1]?.split('/')[0] || 'unknown',
      })

      await mongoose.connect(mongoUri, {
        maxPoolSize: isProduction ? 10 : 5,
        minPoolSize: isProduction ? 2 : 1,
        serverSelectionTimeoutMS: 10000, // Increased from 5000 to 10000
        socketTimeoutMS: 45000,
        heartbeatFrequencyMS: 10000,
        retryWrites: true,
        retryReads: true,
      })

      // Verify connection by pinging the database
      if (!mongoose.connection.db) {
        throw new Error('MongoDB connection established but database object is undefined')
      }
      
      await mongoose.connection.db.admin().ping()
      
      logInfo('✅ Connected to MongoDB Atlas', {
        database: mongoose.connection.db.databaseName,
        host: mongoose.connection.host,
        readyState: mongoose.connection.readyState,
      })
      
      return // Success, exit retry loop
    } catch (error) {
      lastError = error as Error
      
      // Check if it's an IP whitelist error
      const errorMessage = error instanceof Error ? error.message : String(error)
      const isIPWhitelistError = errorMessage.includes('whitelist') || 
                                  errorMessage.includes('IP') ||
                                  errorMessage.includes('ReplicaSetNoPrimary')

      if (isIPWhitelistError && attempt === 1) {
        logError('❌ MongoDB connection failed - IP whitelist issue detected', {
          error: errorMessage,
          hint: 'Please ensure your deployment platform IP addresses are whitelisted in MongoDB Atlas Network Access settings',
          atlasUrl: 'https://cloud.mongodb.com/v2#/security/network/whitelist',
        })
      } else {
        logError(`❌ MongoDB connection attempt ${attempt}/${MAX_RETRIES} failed`, error)
      }

      // If this is the last attempt, don't wait
      if (attempt < MAX_RETRIES) {
        const retryDelay = Math.min(
          INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1),
          MAX_RETRY_DELAY
        )
        logWarn(`Retrying MongoDB connection in ${retryDelay}ms...`, {
          attempt: attempt + 1,
          maxRetries: MAX_RETRIES,
        })
        await delay(retryDelay)
      }
    }
  }

  // All retries failed
  logError('❌ MongoDB connection failed after all retry attempts', lastError)
  throw lastError || new Error('MongoDB connection failed')
}

mongoose.connection.on('disconnected', () => {
  logWarn('⚠️ MongoDB disconnected')
})

mongoose.connection.on('error', (error) => {
  logError('❌ MongoDB error', error)
})

mongoose.connection.on('reconnected', () => {
  logInfo('✅ MongoDB reconnected')
})
