import mongoose from 'mongoose'
import { logInfo, logWarn, logError } from '../utils/logger.js'

export const connectMongoDB = async (): Promise<void> => {
  try {
    const mongoUri = process.env.MONGODB_URI
    
    if (!mongoUri) {
      throw new Error('MONGODB_URI is not defined in environment variables')
    }

    const isProduction = process.env.NODE_ENV === 'production'

    await mongoose.connect(mongoUri, {
      maxPoolSize: isProduction ? 10 : 5,
      minPoolSize: isProduction ? 2 : 1,
      serverSelectionTimeoutMS: 5000,
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
  } catch (error) {
    logError('❌ MongoDB connection error', error)
    throw error
  }
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
