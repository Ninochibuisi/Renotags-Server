import { logError } from './logger.js'

process.on('uncaughtException', (error: Error) => {
  logError('Uncaught Exception', error)
  console.error('💥 Uncaught Exception:', error)
  
  setTimeout(() => {
    process.exit(1)
  }, 1000)
})

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logError('Unhandled Rejection', { reason, promise })
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason)
  
  setTimeout(() => {
    process.exit(1)
  }, 1000)
})

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...')
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...')
  process.exit(0)
})

export const gracefulShutdown = (server: any, signal: string) => {
  console.log(`${signal} received, shutting down gracefully...`)
  
  server.close(() => {
    console.log('HTTP server closed')
    process.exit(0)
  })

  setTimeout(() => {
    console.error('Forced shutdown after timeout')
    process.exit(1)
  }, 10000)
}
