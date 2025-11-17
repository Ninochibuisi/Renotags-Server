import { Request, Response, NextFunction } from 'express'
import { User } from '../models/User.js'
import { logWarn, logError } from '../utils/logger.js'

export interface BanRequest extends Request {
  user?: {
    email: string
    id: string
    role: string
  }
}

export const checkBanStatus = async (req: BanRequest, res: Response, next: NextFunction) => {
  try {
    const userEmail = req.user?.email
    if (!userEmail) {
      return next()
    }

    const user = await User.findOne({ email: userEmail.toLowerCase() })
      .select('banned banReason bannedUntil')

    if (user && user.banned) {
      const now = new Date()

      if (user.bannedUntil && new Date(user.bannedUntil) < now) {
        // Ban expired, unban user
        user.banned = false
        user.banReason = undefined
        user.bannedUntil = undefined
        await user.save()
        return next()
      }

      logWarn('Banned user attempted access', { email: userEmail })
      return res.status(403).json({
        success: false,
        message: 'Your account has been banned',
        banReason: user.banReason || 'Violation of terms of service',
        bannedUntil: user.bannedUntil || null,
      })
    }

    next()
  } catch (error) {
    logError('Error checking ban status', error)
    next()
  }
}
