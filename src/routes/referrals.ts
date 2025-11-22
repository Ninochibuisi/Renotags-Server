import express from 'express'
import mongoose from 'mongoose'
import { authenticate, AuthRequest } from '../middleware/auth.js'
import { checkBanStatus } from '../middleware/banCheck.js'
import { User } from '../models/User.js'
import { Referral } from '../models/Referral.js'
import { awardPoints } from '../utils/pointsManager.js'
import { logError, logWarn, logInfo } from '../utils/logger.js'
import { z } from 'zod'

const router = express.Router()

// Get user's referrals (requires authentication)
router.get('/my-referrals', authenticate, checkBanStatus, async (req: AuthRequest, res, next) => {
  try {
    const userEmail = req.user?.email
    if (!userEmail) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      })
    }

    const user = await User.findOne({ email: userEmail })
    if (!user || !user.renopaysTag) {
      return res.status(404).json({
        success: false,
        message: 'User not found or renopays tag not set',
      })
    }

    // Get all referrals for this user
    const referrals = await Referral.find({ referrerId: user._id })
      .populate('referrerId', 'email name')
      .sort({ createdAt: -1 })
      .lean()

    // Get referred user details
    const referredEmails = referrals.map(r => r.referredEmail)
    const referredUsers = await User.find({ email: { $in: referredEmails } })
      .select('email name status emailVerified telegramVerified telegramFollowed renopaysTag')
      .lean()

    const userMap = new Map(referredUsers.map(u => [u.email, u]))

    const referralsWithUsers = referrals.map(ref => {
      const referredUser = userMap.get(ref.referredEmail)
      return {
        ...ref,
        referred_user_email: referredUser?.email,
        referred_user_name: referredUser?.name,
        referred_user_status: referredUser?.status,
        email_verified: referredUser?.emailVerified,
        telegram_verified: referredUser?.telegramVerified,
        telegram_followed: referredUser?.telegramFollowed,
        renopays_tag: referredUser?.renopaysTag,
      }
    })

    // Get referral statistics
    const total = referrals.length
    const successful = referrals.filter(r => r.allVerificationsComplete).length
    const pending = referrals.filter(r => r.status === 'pending').length

    res.json({
      success: true,
      data: {
        referrals: referralsWithUsers,
        stats: {
          total,
          successful,
          pending,
        },
        referralCode: user.renopaysTag,
        referralLink: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/ref/${user.renopaysTag}`,
      },
    })
  } catch (error) {
    next(error)
  }
})

// Check and update referral status when user completes verifications
router.post('/check-referral-completion', authenticate, checkBanStatus, async (req: AuthRequest, res, next) => {
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

    // Check if all verifications are complete
    const allComplete = 
      user.emailVerified &&
      user.telegramVerified &&
      user.telegramFollowed &&
      !!user.renopaysTag

    if (!allComplete) {
      return res.json({
        success: true,
        data: {
          allComplete: false,
          requirements: {
            emailVerified: user.emailVerified,
            telegramVerified: user.telegramVerified,
            telegramFollowed: user.telegramFollowed,
            renopaysTagCreated: !!user.renopaysTag,
          },
        },
      })
    }

    // If all complete and user was referred, update referral status
    if (user.referredBy) {
      const referrer = await User.findOne({ renopaysTag: user.referredBy })
      
      if (referrer) {
        // Find or create referral record
        let referral = await Referral.findOne({
          referrerId: referrer._id,
          referredEmail: userEmail.toLowerCase(),
        })

        if (!referral) {
          referral = await Referral.create({
            referrerId: referrer._id,
            referredEmail: userEmail.toLowerCase(),
            referredName: user.name,
          })
        }

        // Update referral record
        referral.emailVerified = user.emailVerified
        referral.telegramVerified = user.telegramVerified
        referral.telegramFollowed = user.telegramFollowed
        referral.renopaysTagCreated = !!user.renopaysTag
        referral.allVerificationsComplete = allComplete
        referral.status = allComplete ? 'completed' : 'pending'
        if (allComplete && !referral.completedAt) {
          referral.completedAt = new Date()
        }
        await referral.save()

        // If referral is now complete and points not yet awarded, award points
        if (allComplete && !referral.pointsAwarded) {
          // Award points to referrer securely (150 points per successful referral)
          const referrerPointsResult = await awardPoints(
            (referrer._id as mongoose.Types.ObjectId).toString(),
            150,
            'Successful referral completed',
            { referredEmail: userEmail, referralId: (referral._id as mongoose.Types.ObjectId).toString() }
          )

          if (referrerPointsResult.success) {
            referrer.successfulReferrals = (referrer.successfulReferrals || 0) + 1
            await referrer.save()

            logInfo('Referral points awarded to referrer', {
              referrerEmail: referrer.email,
              referredEmail: userEmail,
              points: 150,
            })
          } else {
            logWarn('Failed to award referral points to referrer', {
              referrerEmail: referrer.email,
              referredEmail: userEmail,
            })
          }

          // Award bonus points to referred user securely (100 points)
          const referredPointsResult = await awardPoints(
            (user._id as mongoose.Types.ObjectId).toString(),
            100,
            'Referral bonus - completed all verifications',
            { referrerEmail: referrer.email, referralId: (referral._id as mongoose.Types.ObjectId).toString() }
          )

          if (referredPointsResult.success) {
            logInfo('Referral bonus points awarded to referred user', {
              referredEmail: userEmail,
              points: 100,
            })
          } else {
            logWarn('Failed to award referral bonus points', {
              referredEmail: userEmail,
            })
          }

          // Mark points as awarded only if both succeeded
          if (referrerPointsResult.success && referredPointsResult.success) {
            referral.pointsAwarded = true
            await referral.save()
          }
        }
      }
    }

    res.json({
      success: true,
      data: {
        allComplete: true,
        message: 'All verifications complete!',
      },
    })
  } catch (error) {
    next(error)
  }
})

// Mark Telegram as followed (will be called by Telegram bot later)
router.post('/mark-telegram-followed', authenticate, checkBanStatus, async (req: AuthRequest, res, next) => {
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

    user.telegramFollowed = true
    await user.save()

    // Trigger referral check
    // (In production, this would be called automatically when bot verifies)

    res.json({
      success: true,
      message: 'Telegram follow status updated',
      data: {
        telegramFollowed: true,
      },
    })
  } catch (error) {
    next(error)
  }
})

export default router

