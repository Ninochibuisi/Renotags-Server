import express from 'express'
import { authenticate, requireAdmin, requirePermission, AuthRequest } from '../middleware/auth.js'
import { auditLog } from '../middleware/auditLog.js'
import { User } from '../models/User.js'
import { Referral } from '../models/Referral.js'
import { Task } from '../models/Task.js'
import { UserTask } from '../models/UserTask.js'
import { OnboardingEvent } from '../models/OnboardingEvent.js'
import { AuditLog } from '../models/AuditLog.js'
import { emailService } from '../services/emailService.js'
import { logInfo, logWarn } from '../utils/logger.js'
import { z } from 'zod'

const router = express.Router()

router.use(authenticate)
router.use(requireAdmin)

// Get all users with pagination
router.get('/users', requirePermission('users', 'read'), async (req: AuthRequest, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 20
    const status = req.query.status as string
    const skip = (page - 1) * limit

    const filter: any = {}
    if (status) {
      filter.status = status
    }

    const users = await User.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-emailVerificationToken')

    const total = await User.countDocuments(filter)

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    })
  } catch (error) {
    next(error)
  }
})

router.get('/users/:userId', requirePermission('users', 'read'), async (req: AuthRequest, res, next) => {
  try {
    const { userId } = req.params

    const user = await User.findById(userId).select('-emailVerificationToken')

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      })
    }

    const userData: any = user.toObject()

    res.json({
      success: true,
      data: {
        ...userData,
        points: user.points || 0,
      },
    })
  } catch (error) {
    next(error)
  }
})

// Update user status
const updateStatusSchema = z.object({
  userId: z.string(),
  status: z.enum(['pending', 'onboarded', 'active', 'inactive']),
  onboardingStep: z.number().min(1).max(5).optional(),
})

router.patch('/users/:userId/status', auditLog('user_status_update', 'user'), requirePermission('users', 'write'), async (req: AuthRequest, res, next) => {
  try {
    const { userId } = req.params
    const { status, onboardingStep } = updateStatusSchema.parse({
      userId,
      ...req.body,
    })

    const user = await User.findByIdAndUpdate(
      userId,
      {
        status,
        ...(onboardingStep && { onboardingStep }),
      },
      { new: true }
    )

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      })
    }

    // Log event
    await OnboardingEvent.create({
      userId: user._id,
      eventType: 'status_updated',
      eventData: { status, onboardingStep, updatedBy: req.user?.email },
    })

    // Send email notification if status changed to onboarded
    if (status === 'onboarded') {
      await emailService.sendOnboardingUpdate(
        user.email,
        user.name,
        onboardingStep || user.onboardingStep
      )
    }

    logInfo('User status updated', { userId, status, updatedBy: req.user?.email })

    res.json({
      success: true,
      data: user,
    })
  } catch (error) {
    next(error)
  }
})

// Ban user
const banUserSchema = z.object({
  userId: z.string(),
  banReason: z.string().min(1),
  bannedUntil: z.string().optional(), // ISO date string
})

router.post('/users/:userId/ban', auditLog('user_banned', 'user'), requirePermission('users', 'ban'), async (req: AuthRequest, res, next) => {
  try {
    const { userId } = req.params
    const { banReason, bannedUntil } = banUserSchema.parse({
      userId,
      ...req.body,
    })

    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      })
    }

    // Update ban status
    user.banned = true
    user.banReason = banReason
    user.bannedUntil = bannedUntil ? new Date(bannedUntil) : undefined
    await user.save()

    // Log event
    await OnboardingEvent.create({
      userId: user._id,
      eventType: 'user_banned',
      eventData: {
        banReason,
        bannedUntil: bannedUntil || null,
        bannedBy: req.user?.email,
      },
    })

    logWarn('User banned', {
      userId,
      email: user.email,
      banReason,
      bannedBy: req.user?.email,
    })

    res.json({
      success: true,
      message: 'User banned successfully',
      data: {
        banned: true,
        banReason,
        bannedUntil: bannedUntil || null,
      },
    })
  } catch (error) {
    next(error)
  }
})

// Unban user
router.post('/users/:userId/unban', auditLog('user_unbanned', 'user'), requirePermission('users', 'ban'), async (req: AuthRequest, res, next) => {
  try {
    const { userId } = req.params

    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      })
    }

    // Update ban status
    user.banned = false
    user.banReason = undefined
    user.bannedUntil = undefined
    await user.save()

    // Log event
    await OnboardingEvent.create({
      userId: user._id,
      eventType: 'user_unbanned',
      eventData: { unbannedBy: req.user?.email },
    })

    logInfo('User unbanned', {
      userId,
      email: user.email,
      unbannedBy: req.user?.email,
    })

    res.json({
      success: true,
      message: 'User unbanned successfully',
    })
  } catch (error) {
    next(error)
  }
})

// Delete user
router.delete('/users/:userId', auditLog('user_deleted', 'user'), requirePermission('users', 'delete'), async (req: AuthRequest, res, next) => {
  try {
    const { userId } = req.params

    const user = await User.findByIdAndDelete(userId)

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      })
    }

    // User is already deleted from MongoDB

    logWarn('User deleted', { userId, email: user.email, deletedBy: req.user?.email })

    res.json({
      success: true,
      message: 'User deleted successfully',
    })
  } catch (error) {
    next(error)
  }
})

router.get('/stats', requirePermission('analytics', 'read'), async (req: AuthRequest, res, next) => {
  try {
    const totalUsers = await User.countDocuments()
    const activeUsers = await User.countDocuments({ status: 'active' })
    const onboardedUsers = await User.countDocuments({ status: 'onboarded' })
    const pendingUsers = await User.countDocuments({ status: 'pending' })
    const bannedUsers = await User.countDocuments({ banned: true })

    // User growth (last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    
    const userGrowth = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      },
      {
        $project: {
          date: '$_id',
          count: 1,
          _id: 0
        }
      }
    ])

    // Referral stats
    const referralStats = await Referral.aggregate([
      {
        $group: {
          _id: null,
          total_referrals: { $sum: 1 },
          successful_referrals: {
            $sum: { $cond: ['$allVerificationsComplete', 1, 0] }
          },
          pending_referrals: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
          }
        }
      }
    ])

    // Task stats
    const taskStats = await Task.aggregate([
      {
        $group: {
          _id: null,
          total_tasks: { $sum: 1 },
          active_tasks: {
            $sum: { $cond: ['$isActive', 1, 0] }
          },
          inactive_tasks: {
            $sum: { $cond: ['$isActive', 0, 1] }
          }
        }
      }
    ])

    // Task completions
    const taskCompletions = await Task.aggregate([
      {
        $lookup: {
          from: 'usertasks',
          localField: '_id',
          foreignField: 'taskId',
          as: 'userTasks'
        }
      },
      {
        $project: {
          title: 1,
          task_type: 1,
          completions: { $size: '$userTasks' },
          completed: {
            $size: {
              $filter: {
                input: '$userTasks',
                as: 'ut',
                cond: { $eq: ['$$ut.status', 'completed'] }
              }
            }
          }
        }
      },
      {
        $sort: { completions: -1 }
      }
    ])

    // Points distribution
    const pointsDistribution = await User.aggregate([
      {
        $project: {
          range: {
            $switch: {
              branches: [
                { case: { $eq: ['$points', 0] }, then: '0' },
                { case: { $and: [{ $gte: ['$points', 1] }, { $lte: ['$points', 100] }] }, then: '1-100' },
                { case: { $and: [{ $gte: ['$points', 101] }, { $lte: ['$points', 500] }] }, then: '101-500' },
                { case: { $and: [{ $gte: ['$points', 501] }, { $lte: ['$points', 1000] }] }, then: '501-1000' }
              ],
              default: '1000+'
            }
          }
        }
      },
      {
        $group: {
          _id: '$range',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      },
      {
        $project: {
          range: '$_id',
          count: 1,
          _id: 0
        }
      }
    ])

    // Top referrers
    const topReferrers = await Referral.aggregate([
      {
        $lookup: {
          from: 'users',
          localField: 'referrerId',
          foreignField: '_id',
          as: 'referrer'
        }
      },
      {
        $unwind: '$referrer'
      },
      {
        $group: {
          _id: '$referrerId',
          email: { $first: '$referrer.email' },
          name: { $first: '$referrer.name' },
          total_referrals: { $sum: 1 },
          successful: {
            $sum: { $cond: ['$allVerificationsComplete', 1, 0] }
          }
        }
      },
      {
        $sort: { total_referrals: -1 }
      },
      {
        $limit: 10
      },
      {
        $project: {
          _id: 0,
          email: 1,
          name: 1,
          total_referrals: 1,
          successful: 1
        }
      }
    ])

    // Conversion funnel
    const conversionFunnel = await User.aggregate([
      {
        $group: {
          _id: null,
          signed_up: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
          },
          email_verified: {
            $sum: { $cond: ['$emailVerified', 1, 0] }
          },
          tag_created: {
            $sum: { $cond: [{ $ne: ['$renopaysTag', null] }, 1, 0] }
          },
          telegram_verified: {
            $sum: { $cond: ['$telegramVerified', 1, 0] }
          },
          active: {
            $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
          }
        }
      }
    ])

    res.json({
      success: true,
      data: {
        users: {
          total: totalUsers,
          active: activeUsers,
          onboarded: onboardedUsers,
          pending: pendingUsers,
          banned: bannedUsers,
        },
        growth: {
          daily: userGrowth,
        },
        referrals: referralStats[0] || {
          total_referrals: 0,
          successful_referrals: 0,
          pending_referrals: 0,
        },
        tasks: taskStats[0] || {
          total_tasks: 0,
          active_tasks: 0,
          inactive_tasks: 0,
        },
        taskCompletions: taskCompletions,
        pointsDistribution: pointsDistribution,
        topReferrers: topReferrers,
        conversionFunnel: conversionFunnel[0] || {},
      },
    })
  } catch (error) {
    next(error)
  }
})

router.get('/analytics/users', requirePermission('analytics', 'read'), async (req: AuthRequest, res, next) => {
  try {
    const period = (req.query.period as string) || '7d'
    
    let daysAgo = 7
    let dateFormat = '%Y-%m-%d'
    
    if (period === '30d') {
      daysAgo = 30
      dateFormat = '%Y-%m-%d'
    } else if (period === '90d') {
      daysAgo = 90
      dateFormat = '%Y-%m-%d'
    } else if (period === '1y') {
      daysAgo = 365
      dateFormat = '%Y-%m'
    }

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - daysAgo)

    const userGrowth = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: dateFormat, date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      },
      {
        $project: {
          date: '$_id',
          count: 1,
          _id: 0
        }
      }
    ])

    const statusDistribution = await User.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          status: '$_id',
          count: 1,
          _id: 0
        }
      }
    ])

    res.json({
      success: true,
      data: {
        growth: userGrowth,
        statusDistribution: statusDistribution,
      },
    })
  } catch (error) {
    next(error)
  }
})

router.get('/analytics/tasks', requirePermission('analytics', 'read'), async (req: AuthRequest, res, next) => {
  try {
    const taskPerformance = await Task.aggregate([
      {
        $match: { isActive: true }
      },
      {
        $lookup: {
          from: 'usertasks',
          localField: '_id',
          foreignField: 'taskId',
          as: 'userTasks'
        }
      },
      {
        $project: {
          id: { $toString: '$_id' },
          title: 1,
          task_type: 1,
          points_reward: 1,
          total_attempts: { $size: '$userTasks' },
          completions: {
            $size: {
              $filter: {
                input: '$userTasks',
                as: 'ut',
                cond: { $eq: ['$$ut.status', 'completed'] }
              }
            }
          }
        }
      },
      {
        $project: {
          id: 1,
          title: 1,
          task_type: 1,
          points_reward: 1,
          total_attempts: 1,
          completions: 1,
          completion_rate: {
            $cond: [
              { $eq: ['$total_attempts', 0] },
              0,
              {
                $multiply: [
                  {
                    $divide: ['$completions', '$total_attempts']
                  },
                  100
                ]
              }
            ]
          }
        }
      },
      {
        $sort: { completions: -1 }
      }
    ])

    res.json({
      success: true,
      data: {
        taskPerformance: taskPerformance,
      },
    })
  } catch (error) {
    next(error)
  }
})

router.get('/audit-logs', requirePermission('analytics', 'read'), async (req: AuthRequest, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 50
    const skip = (page - 1) * limit

    const logs = await AuditLog.find()
      .populate('adminId', 'email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()

    const total = await AuditLog.countDocuments()

    const formattedLogs = logs.map(log => ({
      ...log,
      admin_email: (log.adminId as any)?.email || null,
      admin_id: (log.adminId as any)?._id?.toString() || log.adminId
    }))

    res.json({
      success: true,
      data: {
        logs: formattedLogs,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    })
  } catch (error) {
    next(error)
  }
})

export default router
