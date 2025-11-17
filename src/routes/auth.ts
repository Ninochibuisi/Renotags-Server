import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import type { StringValue } from 'ms'
import crypto from 'crypto'
import mongoose from 'mongoose'
import { AdminUser } from '../models/AdminUser.js'
import { strictRateLimiter, rateLimiter } from '../middleware/rateLimiter.js'
import { User } from '../models/User.js'
import { emailService } from '../services/emailService.js'
import { authenticate, AuthRequest } from '../middleware/auth.js'
import { logError, logWarn } from '../utils/logger.js'
import { getJwtSecret } from '../utils/jwtSecret.js'
import { z } from 'zod'

const router = express.Router()

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

// Admin/User login
router.post('/login', strictRateLimiter, async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body)

    // Check admin users first
    const admin = await AdminUser.findOne({ 
      email: email.toLowerCase(),
      isActive: true 
    }).select('+passwordHash')

    if (admin) {
      const isValid = await bcrypt.compare(password, admin.passwordHash)

      if (!isValid) {
        logWarn('Failed admin login attempt', { email: email.toLowerCase() })
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials',
        })
      }

      // Update last login
      admin.lastLogin = new Date()
      await admin.save()

      const adminRole = admin.role || 'admin'
      
      const jwtSecret = getJwtSecret()
      const expiresIn: StringValue | number = (process.env.JWT_EXPIRES_IN || '7d') as StringValue
      const token = jwt.sign(
        { id: (admin._id as mongoose.Types.ObjectId).toString(), email: admin.email, role: adminRole },
        jwtSecret,
        { expiresIn }
      )

      return res.json({
        success: true,
        token,
        user: {
          id: (admin._id as mongoose.Types.ObjectId).toString(),
          email: admin.email,
          role: adminRole,
        },
        redirectTo: '/admin',
      })
    }

    // Check regular users
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password')
    
    if (!user || !user.password) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      })
    }

    const isValid = await bcrypt.compare(password, user.password)

    if (!isValid) {
      logWarn('Failed user login attempt', { email: email.toLowerCase() })
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      })
    }

    if (!user.emailVerified) {
      return res.status(403).json({
        success: false,
        message: 'Please verify your email before logging in',
      })
    }

    // Check if user is banned
    if (user.banned) {
      const now = new Date()

      // Check if ban has expired
      if (user.bannedUntil && new Date(user.bannedUntil) < now) {
        // Unban user
        user.banned = false
        user.banReason = undefined
        user.bannedUntil = undefined
        await user.save()
      } else {
        logWarn('Banned user attempted login', { email: email.toLowerCase() })
        return res.status(403).json({
          success: false,
          message: 'Your account has been banned',
          banReason: user.banReason || 'Violation of terms of service',
          bannedUntil: user.bannedUntil || null,
        })
      }
    }

    const jwtSecret = getJwtSecret()
    const expiresIn: StringValue | number = (process.env.JWT_EXPIRES_IN || '7d') as StringValue
    const token = jwt.sign(
      { id: (user._id as mongoose.Types.ObjectId).toString(), email: user.email, role: 'user' },
      jwtSecret,
      { expiresIn }
    )

    return res.json({
      success: true,
      token,
      user: {
        id: (user._id as mongoose.Types.ObjectId).toString(),
        email: user.email,
        name: user.name,
        role: 'user',
        banned: false,
      },
      redirectTo: '/dashboard',
    })
  } catch (error) {
    next(error)
  }
})

// Setup password
const setupPasswordSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

router.post('/setup-password', strictRateLimiter, async (req, res, next) => {
  try {
    const { email, password } = setupPasswordSchema.parse(req.body)
    
    const user = await User.findOne({ email: email.toLowerCase() })
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      })
    }

    if (user.password) {
      return res.status(400).json({
        success: false,
        message: 'Password already set',
      })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    user.password = passwordHash
    await user.save()

    // Generate email verification token
    const verificationToken = crypto.randomBytes(32).toString('hex')
    user.emailVerificationToken = verificationToken
    await user.save()

    // Send verification email
    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email?token=${verificationToken}&email=${encodeURIComponent(email)}`
    await emailService.sendVerificationEmail(email, user.name, verificationUrl)

    res.json({
      success: true,
      message: 'Password set successfully. Please check your email for verification.',
    })
  } catch (error) {
    next(error)
  }
})

// Verify email
router.get('/verify-email', async (req, res, next) => {
  try {
    const { token, email } = req.query

    if (!token || !email) {
      return res.status(400).json({
        success: false,
        message: 'Token and email are required',
      })
    }

    const user = await User.findOne({ 
      email: (email as string).toLowerCase(),
      emailVerificationToken: token as string
    })

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification token',
      })
    }

    user.emailVerified = true
    user.emailVerificationToken = undefined
    user.status = 'onboarded'
    await user.save()

    res.json({
      success: true,
      message: 'Email verified successfully',
    })
  } catch (error) {
    next(error)
  }
})

// Get current user from token
router.get('/me', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const userEmail = req.user?.email
    if (!userEmail) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      })
    }

    const user = await User.findOne({ email: userEmail })
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      })
    }

    // Check ban status
    let banned = false
    let banReason = null
    let bannedUntil = null

    if (user.banned) {
      const now = new Date()

      if (user.bannedUntil && new Date(user.bannedUntil) < now) {
        // Unban user
        user.banned = false
        user.banReason = undefined
        user.bannedUntil = undefined
        await user.save()
      } else {
        banned = true
        banReason = user.banReason || null
        bannedUntil = user.bannedUntil || null
      }
    }

    res.json({
      success: true,
      data: {
        user: {
          email: user.email,
          name: user.name,
          status: user.status,
          onboardingStep: user.onboardingStep,
          interests: user.interests,
          emailVerified: user.emailVerified,
          createdAt: user.createdAt,
          renopaysTag: user.renopaysTag,
          points: user.points || 0,
          telegramVerified: user.telegramVerified || false,
          telegramUsername: user.telegramUsername,
          telegramFollowed: user.telegramFollowed || false,
          referredBy: user.referredBy,
          successfulReferrals: user.successfulReferrals || 0,
          banned,
          banReason,
          bannedUntil,
        },
      },
    })
  } catch (error) {
    logError('Error fetching user', error)
    next(error)
  }
})

// Resend verification email
router.post('/resend-verification', rateLimiter, async (req, res, next) => {
  try {
    const { email } = req.body

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required',
      })
    }

    const user = await User.findOne({ email: email.toLowerCase() })

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      })
    }

    if (user.emailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email already verified',
      })
    }

    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString('hex')
    user.emailVerificationToken = verificationToken
    await user.save()

    // Send verification email
    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email?token=${verificationToken}&email=${encodeURIComponent(email)}`
    await emailService.sendVerificationEmail(email, user.name, verificationUrl)

    res.json({
      success: true,
      message: 'Verification email sent',
    })
  } catch (error) {
    next(error)
  }
})

export default router


