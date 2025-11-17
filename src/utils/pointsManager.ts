import { User } from '../models/User.js'
import { OnboardingEvent } from '../models/OnboardingEvent.js'
import { logInfo, logWarn, logError } from './logger.js'

export const awardPoints = async (
  userId: string,
  amount: number,
  reason: string,
  metadata?: any
): Promise<{ success: boolean; newBalance: number; error?: string }> => {
  try {
    if (amount <= 0) {
      return { success: false, error: 'Points amount must be positive', newBalance: 0 }
    }

    const user = await User.findById(userId)
    if (!user) {
      return { success: false, error: 'User not found', newBalance: 0 }
    }

    const oldBalance = user.points || 0
    const newBalance = oldBalance + amount

    user.points = newBalance
    await user.save()

    // Log points award event
    await OnboardingEvent.create({
      userId: user._id,
      eventType: 'points_awarded',
      eventData: {
        amount,
        reason,
        oldBalance,
        newBalance,
        metadata,
      },
    })

    logInfo('Points awarded', { userId, amount, reason, oldBalance, newBalance })
    return { success: true, newBalance }
  } catch (error) {
    logError('Error awarding points', error)
    return { success: false, error: 'Failed to award points', newBalance: 0 }
  }
}

export const verifyPointsBalance = async (userId: string, expectedBalance: number): Promise<boolean> => {
  try {
    const user = await User.findById(userId)
    if (!user) {
      return false
    }

    const actualBalance = user.points || 0
    if (actualBalance !== expectedBalance) {
      logWarn('Points balance mismatch detected', {
        userId,
        expected: expectedBalance,
        actual: actualBalance,
      })
      return false
    }

    return true
  } catch (error) {
    logError('Error verifying points balance', error)
    return false
  }
}

export const getPointsHistory = async (userEmail: string, limit: number = 50) => {
  try {
    const user = await User.findOne({ email: userEmail.toLowerCase() })
    
    if (!user) {
      return []
    }

    const events = await OnboardingEvent.find({ 
      userId: user._id,
      eventType: 'points_awarded'
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()

    return events.map(event => ({
      ...event.eventData,
      timestamp: event.createdAt,
    }))
  } catch (error) {
    logError('Error fetching points history', error)
    return []
  }
}
