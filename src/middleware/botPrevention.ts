import { Request, Response, NextFunction } from 'express'
import { User } from '../models/User.js'
import { BotDetection } from '../models/BotDetection.js'
import { OnboardingEvent } from '../models/OnboardingEvent.js'
import { logWarn } from '../utils/logger.js'
import crypto from 'crypto'

export interface BotPreventionRequest extends Request {
  fingerprint?: string
  suspiciousScore?: number
}

export const generateFingerprint = (req: Request): string => {
  const userAgent = req.get('user-agent') || ''
  const acceptLanguage = req.get('accept-language') || ''
  const acceptEncoding = req.get('accept-encoding') || ''
  const ip = req.ip || req.socket.remoteAddress || ''
  
  const fingerprintString = `${ip}-${userAgent}-${acceptLanguage}-${acceptEncoding}`
  return crypto.createHash('sha256').update(fingerprintString).digest('hex')
}

export const checkBotActivity = async (
  req: BotPreventionRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const email = req.body?.email?.toLowerCase()
    const ip = req.ip || req.socket.remoteAddress || ''
    const fingerprint = generateFingerprint(req)
    
    req.fingerprint = fingerprint

    if (!email) {
      return next()
    }

    // Check for recent signups from this email
    const oneHourAgo = new Date()
    oneHourAgo.setHours(oneHourAgo.getHours() - 1)
    
    const recentSignup = await User.findOne({
      email: email.toLowerCase(),
      createdAt: { $gte: oneHourAgo }
    })

    if (recentSignup) {
      return res.status(429).json({
        success: false,
        message: 'Too many signups from this email. Please try again later.',
      })
    }

    // Check for signups from same IP (check events with signup_ip in eventData)
    const ipSignups = await OnboardingEvent.countDocuments({
      eventType: 'onboarding_started',
      'eventData.signup_ip': ip,
      createdAt: { $gte: oneHourAgo }
    })

    if (ipSignups >= 3) {
      await BotDetection.create({
        email,
        ipAddress: ip,
        userAgent: req.get('user-agent'),
        fingerprint,
        suspiciousScore: 100,
        flaggedReasons: [{ reason: 'Too many signups from same IP' }],
        blocked: true,
      })

      logWarn('Bot activity detected', { email, ip, fingerprint })
      return res.status(429).json({
        success: false,
        message: 'Too many signups from this IP. Please try again later.',
      })
    }

    // Check existing bot detection records
    const botCheck = await BotDetection.findOne({
      $or: [
        { email },
        { ipAddress: ip },
        { fingerprint }
      ]
    }).sort({ createdAt: -1 })

    if (botCheck && botCheck.blocked) {
      return res.status(403).json({
        success: false,
        message: 'Access denied due to suspicious activity',
      })
    }

    let suspiciousScore = botCheck?.suspiciousScore || 0

    const userAgent = req.get('user-agent') || ''
    if (!userAgent || userAgent.length < 10) {
      suspiciousScore += 20
    }

    if (suspiciousScore >= 50) {
      await BotDetection.create({
        email,
        ipAddress: ip,
        userAgent,
        fingerprint,
        suspiciousScore,
        flaggedReasons: [{ reason: 'High suspicious score' }],
        blocked: false,
      })
    }

    req.suspiciousScore = suspiciousScore
    next()
  } catch (error) {
    next()
  }
}

export const honeypotField = (req: Request, res: Response, next: NextFunction) => {
  if (req.body.website || req.body.url) {
    return res.status(400).json({
      success: false,
      message: 'Invalid form submission',
    })
  }
  next()
}

