import bcrypt from 'bcryptjs'
import { connectMongoDB } from '../config/mongodb.js'
import { AdminUser } from '../models/AdminUser.js'
import { logInfo, logError } from '../utils/logger.js'
import dotenv from 'dotenv'
import readline from 'readline'

dotenv.config()

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

const question = (query: string): Promise<string> => {
  return new Promise((resolve) => {
    rl.question(query, resolve)
  })
}

const resetAdminPassword = async () => {
  try {
    await connectMongoDB()
    console.log('✅ Connected to database\n')

    // Get email from command line args or prompt
    const emailArg = process.argv[2]
    let email = emailArg

    if (!email) {
      email = await question('Enter admin email to reset password: ')
    }

    if (!email || !email.includes('@')) {
      logError('Invalid email address')
      console.error('❌ Invalid email address')
      process.exit(1)
    }

    // Check if admin exists
    const admin = await AdminUser.findOne({ email: email.toLowerCase() }).select('+passwordHash')

    if (!admin) {
      logError(`Admin user not found: ${email}`)
      console.error(`❌ Admin user not found: ${email}`)
      console.log('\n💡 Tip: Use the setupAdmin script to create a new admin user.')
      process.exit(1)
    }

    console.log(`\n📧 Found admin user: ${admin.email}`)
    console.log(`👤 Role: ${admin.role}`)
    console.log(`✅ Active: ${admin.isActive ? 'Yes' : 'No'}\n`)

    // Get new password
    let password = process.env.ADMIN_PASSWORD

    if (!password) {
      password = await question('Enter new password (min 12 characters): ')
    }

    if (!password || password.length < 12) {
      logError('Password must be at least 12 characters long')
      console.error('❌ Password must be at least 12 characters long')
      process.exit(1)
    }

    // Confirm password
    if (!process.env.ADMIN_PASSWORD) {
      const confirmPassword = await question('Confirm new password: ')
      if (password !== confirmPassword) {
        logError('Passwords do not match')
        console.error('❌ Passwords do not match')
        process.exit(1)
      }
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(password, 10)

    // Update admin password
    admin.passwordHash = passwordHash
    admin.isActive = true
    await admin.save()

    logInfo(`Admin password reset successful: ${email}`)
    console.log(`\n✅ Admin password reset successful for: ${email}`)
    console.log(`🔐 New password has been set (${password.length} characters)`)
    console.log(`\n⚠️  Remember to update ADMIN_PASSWORD in your .env file if needed.`)
    
    rl.close()
    process.exit(0)
  } catch (error) {
    logError('Error resetting admin password', error)
    console.error('❌ Error resetting admin password:', error)
    rl.close()
    process.exit(1)
  }
}

resetAdminPassword()

