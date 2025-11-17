import bcrypt from 'bcryptjs'
import { connectMongoDB } from '../config/mongodb.js'
import { AdminUser } from '../models/AdminUser.js'
import { logInfo, logError } from '../utils/logger.js'
import dotenv from 'dotenv'

dotenv.config()

const setupAdmin = async () => {
  try {
    const email = process.env.ADMIN_EMAIL
    const password = process.env.ADMIN_PASSWORD

    if (!email || !password) {
      logError('ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env file')
      console.error('❌ ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env file')
      process.exit(1)
    }

    if (password.length < 12) {
      logError('ADMIN_PASSWORD must be at least 12 characters long')
      console.error('❌ ADMIN_PASSWORD must be at least 12 characters long')
      process.exit(1)
    }

    const passwordHash = await bcrypt.hash(password, 10)

    const existing = await AdminUser.findOne({ email: email.toLowerCase() })

    if (existing) {
      existing.passwordHash = passwordHash
      existing.isActive = true
      await existing.save()
      logInfo(`Admin user updated: ${email}`)
      console.log(`✅ Admin user updated: ${email}`)
    } else {
      await AdminUser.create({
        email: email.toLowerCase(),
        passwordHash,
        role: 'super_admin',
        isActive: true,
      })
      logInfo(`Admin user created: ${email}`)
      console.log(`✅ Admin user created: ${email}`)
    }

    console.log(`✅ Admin setup complete for: ${email}`)
    process.exit(0)
  } catch (error) {
    logError('Error setting up admin', error)
    console.error('❌ Error setting up admin:', error)
    process.exit(1)
  }
}

connectMongoDB()
  .then(() => setupAdmin())
  .catch((error) => {
    logError('Failed to connect to database for admin setup', error)
    console.error('Failed to connect to database:', error)
    process.exit(1)
  })
