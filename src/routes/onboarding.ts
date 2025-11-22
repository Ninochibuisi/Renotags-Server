import express from 'express'
import { onboardingSchema } from '../validation/onboardingSchema.js'
import { User } from '../models/User.js'
import { Referral } from '../models/Referral.js'
import { OnboardingEvent } from '../models/OnboardingEvent.js'
import { emailService } from '../services/emailService.js'
import { strictRateLimiter, rateLimiter } from '../middleware/rateLimiter.js'
import { checkBotActivity, honeypotField } from '../middleware/botPrevention.js'
import { logInfo } from '../utils/logger.js'

const router = express.Router()

router.post('/', strictRateLimiter, honeypotField, checkBotActivity, async (req, res, next) => {
  try {
    const validatedData = onboardingSchema.parse(req.body)
    const referralCode = req.body.referralCode as string | undefined

    const existingUser = await User.findOne({ email: validatedData.email })
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered. Please check your email for next steps.',
      })
    }

    let referredBy: string | undefined
    let referredByUserId: mongoose.Types.ObjectId | undefined
    if (referralCode) {
      const referrer = await User.findOne({ renopaysTag: referralCode.toLowerCase() })
      if (referrer) {
        referredBy = referrer.renopaysTag
        referredByUserId = referrer._id as mongoose.Types.ObjectId
      }
    }

    const user = new User({
      email: validatedData.email,
      name: validatedData.name,
      walletAddress: validatedData.walletAddress || undefined,
      interests: validatedData.interests,
      status: 'pending',
      onboardingStep: 1,
      emailVerified: false,
      referredBy: referredBy,
      referredByUserId: referredByUserId,
    })

    await user.save()

    // Log onboarding event
    await OnboardingEvent.create({
      userId: user._id,
      eventType: 'onboarding_started',
      eventData: { 
        step: 1, 
        interests: validatedData.interests, 
        referredBy,
        signup_ip: req.ip || req.socket.remoteAddress || '',
        fingerprint: (req as any).fingerprint,
      },
    })

    // Create referral record if user was referred
    if (referredBy) {
      const referrer = await User.findOne({ renopaysTag: referredBy })
      if (referrer) {
        await Referral.findOneAndUpdate(
          {
            referrerId: referrer._id,
            referredEmail: validatedData.email.toLowerCase(),
          },
          {
            referrerId: referrer._id,
            referredEmail: validatedData.email.toLowerCase(),
            referredName: validatedData.name,
            status: 'pending',
          },
          { upsert: true, new: true }
        )
      }
    }

    const passwordSetupUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/setup-password?email=${encodeURIComponent(validatedData.email)}`
    await emailService.sendPasswordSetupEmail(
      validatedData.email,
      validatedData.name,
      passwordSetupUrl
    )

    logInfo('User signed up for waitlist', { email: validatedData.email })

    res.status(201).json({
      success: true,
      message: 'Onboarding submitted successfully. Please check your email.',
      data: {
        email: user.email,
        status: user.status,
      },
    })
  } catch (error) {
    next(error)
  }
})

router.get('/status/:email', rateLimiter, async (req, res, next) => {
  try {
    const { email } = req.params

    const user = await User.findOne({ email: email.toLowerCase() })
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      })
    }

    res.json({
      success: true,
      data: {
        email: user.email,
        name: user.name,
        status: user.status,
        onboardingStep: user.onboardingStep,
        emailVerified: user.emailVerified,
      },
    })
  } catch (error) {
    next(error)
  }
})

export default router
