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
import { logError, logWarn, logInfo } from '../utils/logger.js'
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
        logWarn('Banned user attempted login', { 
          email: email.toLowerCase(),
          banReason: user.banReason,
          bannedUntil: user.bannedUntil
        })
        return res.status(403).json({
          success: false,
          banned: true,
          message: 'Your account has been banned',
          banReason: user.banReason || 'Violation of terms of service',
          bannedUntil: user.bannedUntil ? user.bannedUntil.toISOString() : null,
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

    // Return full user data for frontend
    return res.json({
      success: true,
      token,
      user: {
        id: (user._id as mongoose.Types.ObjectId).toString(),
        email: user.email,
        name: user.name,
        role: 'user',
        status: user.status,
        onboardingStep: user.onboardingStep,
        interests: user.interests || [],
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        renopaysTag: user.renopaysTag,
        points: user.points || 0,
        telegramVerified: user.telegramVerified || false,
        telegramUsername: user.telegramUsername,
        telegramFollowed: user.telegramFollowed || false,
        referredBy: user.referredBy,
        successfulReferrals: user.successfulReferrals || 0,
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
    const emailSent = await emailService.sendVerificationEmail(email, user.name, verificationUrl)

    if (!emailSent) {
      logWarn('Failed to send verification email', { email: email.toLowerCase() })
      return res.status(500).json({
        success: false,
        message: 'Password set successfully, but failed to send verification email. Please use the resend verification feature.',
      })
    }

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
          bannedUntil: bannedUntil ? bannedUntil.toISOString() : null,
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
    const emailSent = await emailService.sendVerificationEmail(email, user.name, verificationUrl)

    if (!emailSent) {
      logWarn('Failed to send verification email', { email: email.toLowerCase() })
      return res.status(500).json({
        success: false,
        message: 'Failed to send verification email. Please check your email configuration or try again later.',
      })
    }

    res.json({
      success: true,
      message: 'Verification email sent',
    })
  } catch (error) {
    next(error)
  }
})

// Forgot password - request password reset
const forgotPasswordSchema = z.object({
  email: z.string().email(),
})

router.post('/forgot-password', strictRateLimiter, async (req, res, next) => {
  try {
    const { email } = forgotPasswordSchema.parse(req.body)

    logInfo('Forgot password request received', { email: email.toLowerCase() })

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password +passwordResetToken +passwordResetExpires')
    
    // Don't reveal if user exists or not (security best practice)
    if (!user) {
      logWarn('Forgot password request for non-existent user', { email: email.toLowerCase() })
      // Still return success to prevent email enumeration
      return res.json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.',
      })
    }

    // Check if user has a password set
    if (!user.password) {
      logWarn('Forgot password request for user without password', { 
        email: email.toLowerCase(),
        userId: user._id 
      })
      return res.json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.',
      })
    }

    // Generate password reset token
    const resetToken = crypto.randomBytes(32).toString('hex')
    const resetExpires = new Date()
    resetExpires.setHours(resetExpires.getHours() + 1) // Token expires in 1 hour

    user.passwordResetToken = resetToken
    user.passwordResetExpires = resetExpires
    await user.save()

    logInfo('Password reset token generated', { 
      email: email.toLowerCase(),
      userId: (user._id as mongoose.Types.ObjectId).toString(),
      expiresAt: resetExpires.toISOString()
    })

    // Send password reset email
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`
    
    logInfo('Attempting to send password reset email', { 
      email: email.toLowerCase(),
      name: user.name,
      frontendUrl: process.env.FRONTEND_URL,
    })
    
    try {
      const emailSent = await emailService.sendPasswordResetEmail(email, user.name, resetUrl)

      if (!emailSent) {
        logError('Failed to send password reset email - email service returned false', { 
          email: email.toLowerCase(),
          name: user.name,
        })
        return res.status(500).json({
          success: false,
          message: 'Failed to send password reset email. Please check your email configuration or try again later.',
        })
      }

      logInfo('Password reset email sent successfully', { 
        email: email.toLowerCase(),
        name: user.name,
      })

      res.json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.',
      })
    } catch (emailError) {
      logError('Exception while sending password reset email', {
        error: emailError instanceof Error ? emailError.message : String(emailError),
        stack: emailError instanceof Error ? emailError.stack : undefined,
        email: email.toLowerCase(),
      })
      return res.status(500).json({
        success: false,
        message: 'Failed to send password reset email. Please try again later.',
      })
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email address',
        errors: error.errors,
      })
    }
    logError('Error in forgot password route', error)
    next(error)
  }
})

// Reset password - with token
const resetPasswordSchema = z.object({
  email: z.string().email(),
  token: z.string().min(1),
  password: z.string().min(8),
})

router.post('/reset-password', strictRateLimiter, async (req, res, next) => {
  try {
    const { email, token, password } = resetPasswordSchema.parse(req.body)

    const user = await User.findOne({ 
      email: email.toLowerCase(),
      passwordResetToken: token,
      passwordResetExpires: { $gt: new Date() }, // Token not expired
    }).select('+passwordResetToken +passwordResetExpires')

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired password reset token. Please request a new one.',
      })
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(password, 10)
    user.password = passwordHash
    user.passwordResetToken = undefined
    user.passwordResetExpires = undefined
    await user.save()

    logInfo('Password reset successful', { email: email.toLowerCase() })

    res.json({
      success: true,
      message: 'Password reset successful. You can now login with your new password.',
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors,
      })
    }
    next(error)
  }
})

// Test email endpoint (for debugging - remove in production or protect with admin auth)
router.post('/test-email', rateLimiter, async (req, res, next) => {
  try {
    const { email } = req.body
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required',
      })
    }

    logInfo('Testing email service', { email })
    const testResult = await emailService.sendVerificationEmail(
      email,
      'Test User',
      `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email?token=test&email=${encodeURIComponent(email)}`
    )

    if (testResult) {
      res.json({
        success: true,
        message: 'Test email sent successfully',
      })
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to send test email. Check server logs for details.',
      })
    }
  } catch (error) {
    next(error)
  }
})

export default router


