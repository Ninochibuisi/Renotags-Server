import express from 'express'
import mongoose from 'mongoose'
import { User } from '../models/User.js'
import { OnboardingEvent } from '../models/OnboardingEvent.js'
import { authenticate, AuthRequest } from '../middleware/auth.js'
import { checkBanStatus } from '../middleware/banCheck.js'
import { awardPoints } from '../utils/pointsManager.js'
import { logError, logWarn } from '../utils/logger.js'
import { z } from 'zod'

const router = express.Router()

// Get user dashboard data (requires authentication)
router.get('/dashboard/:email', authenticate, checkBanStatus, async (req: AuthRequest, res, next) => {
  try {
    const { email } = req.params

    // Verify user can only access their own data
    if (req.user?.email !== email.toLowerCase() && req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: You can only access your own dashboard',
      })
    }

    const user = await User.findOne({ email: email.toLowerCase() })
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

    // Get onboarding events
    const events = await OnboardingEvent.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean()

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
        events,
      },
    })
  } catch (error) {
    next(error)
  }
})

// Set renopays tag
const renopaysTagSchema = z.object({
  email: z.string().email(),
  tag: z.string().min(3).max(30).regex(/^[a-z0-9_-]+$/),
})

router.post('/renopays-tag', authenticate, checkBanStatus, async (req: AuthRequest, res, next) => {
  try {
    const { email, tag } = renopaysTagSchema.parse(req.body)

    const user = await User.findOne({ email: email.toLowerCase() })
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      })
    }

    // Check if tag is already taken
    const existingTag = await User.findOne({ renopaysTag: tag.toLowerCase() })
    if (existingTag && (existingTag._id as mongoose.Types.ObjectId).toString() !== (user._id as mongoose.Types.ObjectId).toString()) {
      return res.status(400).json({
        success: false,
        message: 'This tag is already taken',
      })
    }

    // Verify user owns this email
    if (req.user?.email !== email.toLowerCase()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: You can only set tags for your own account',
      })
    }

    user.renopaysTag = tag.toLowerCase()
    user.referralCode = tag.toLowerCase() // Set referral code same as tag
    await user.save()

    // Award points securely using points manager
    const pointsResult = await awardPoints(
      (user._id as mongoose.Types.ObjectId).toString(),
      100,
      'Renopays tag created',
      { tag: tag.toLowerCase() }
    )

    if (!pointsResult.success) {
      logWarn('Failed to award points for tag creation', { userId: (user._id as mongoose.Types.ObjectId).toString(), email: user.email })
    }

    // Check referral completion after tag creation
    // This will be called automatically when verifications complete

    // Log event
    await OnboardingEvent.create({
      userId: user._id,
      eventType: 'renopays_tag_created',
      eventData: { tag: tag.toLowerCase(), pointsAwarded: 100 },
    })

    res.json({
      success: true,
      message: 'Renopays tag created successfully',
      data: {
        renopaysTag: user.renopaysTag,
        points: pointsResult.newBalance,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: error.errors[0].message,
      })
    }
    next(error)
  }
})

// Verify Telegram
const telegramSchema = z.object({
  email: z.string().email(),
  username: z.string().min(1),
})

router.post('/verify-telegram', authenticate, checkBanStatus, async (req: AuthRequest, res, next) => {
  try {
    const { email, username } = telegramSchema.parse(req.body)

    const user = await User.findOne({ email: email.toLowerCase() })
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      })
    }

    // Verify user owns this email
    if (req.user?.email !== email.toLowerCase()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: You can only verify Telegram for your own account',
      })
    }

    // In a real implementation, you would verify with Telegram Bot API
    // For now, we'll just mark it as verified
    user.telegramVerified = true
    user.telegramUsername = username.toLowerCase()
    await user.save()

    // Award points securely using points manager
    const pointsResult = await awardPoints(
      (user._id as mongoose.Types.ObjectId).toString(),
      200,
      'Telegram verified',
      { username: username.toLowerCase() }
    )

    if (!pointsResult.success) {
      logWarn('Failed to award points for Telegram verification', { userId: (user._id as mongoose.Types.ObjectId).toString(), email: user.email })
    }

    // Log event
    await OnboardingEvent.create({
      userId: user._id,
      eventType: 'telegram_verified',
      eventData: { username: username.toLowerCase(), pointsAwarded: 200 },
    })

    res.json({
      success: true,
      message: 'Telegram verified successfully',
      data: {
        telegramVerified: true,
        telegramUsername: user.telegramUsername,
        points: pointsResult.newBalance,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: error.errors[0].message,
      })
    }
    next(error)
  }
})

export default router


