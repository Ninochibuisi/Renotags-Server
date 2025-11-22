import { connectMongoDB } from '../config/mongodb.js'
import { AdminUser } from '../models/AdminUser.js'
import dotenv from 'dotenv'

dotenv.config()

const checkAdmin = async () => {
  try {
    await connectMongoDB()
    
    const email = process.env.ADMIN_EMAIL
    
    if (!email) {
      console.error('❌ ADMIN_EMAIL not set in .env file')
      process.exit(1)
    }

    console.log(`\n🔍 Checking admin user: ${email.toLowerCase()}\n`)

    const admin = await AdminUser.findOne({ email: email.toLowerCase() }).select('+passwordHash')

    if (!admin) {
      console.log('❌ Admin user NOT FOUND in database')
      console.log('\n💡 Solution: Run the setup script:')
      console.log('   npm run setup:admin\n')
      process.exit(1)
    }

    console.log('✅ Admin user found!')
    console.log(`   Email: ${admin.email}`)
    console.log(`   Role: ${admin.role}`)
    console.log(`   Is Active: ${admin.isActive}`)
    console.log(`   Created: ${admin.createdAt}`)
    console.log(`   Last Login: ${admin.lastLogin || 'Never'}`)
    console.log(`   Has Password Hash: ${admin.passwordHash ? 'Yes' : 'No'}`)

    if (!admin.isActive) {
      console.log('\n⚠️  WARNING: Admin user is INACTIVE!')
      console.log('   This will prevent login. Run setup:admin to activate.\n')
    }

    if (!admin.passwordHash) {
      console.log('\n⚠️  WARNING: Admin user has no password hash!')
      console.log('   Run setup:admin to set password.\n')
    }

    console.log('\n✅ Admin user looks good!')
    console.log('   If login still fails, verify:')
    console.log('   1. Password matches ADMIN_PASSWORD in .env')
    console.log('   2. Email is exactly: ' + admin.email)
    console.log('   3. No extra spaces in email or password\n')
    
    process.exit(0)
  } catch (error) {
    console.error('❌ Error checking admin:', error)
    process.exit(1)
  }
}

checkAdmin()

