import express from 'express'
import mongoose from 'mongoose'
import { authenticate, requireAdmin, requirePermission, AuthRequest } from '../middleware/auth.js'
import { Task, ITask } from '../models/Task.js'
import { UserTask } from '../models/UserTask.js'
import { logInfo, logWarn, logError } from '../utils/logger.js'
import { z } from 'zod'
import { awardPoints } from '../utils/pointsManager.js'
import { User } from '../models/User.js'

const router = express.Router()

const createTaskSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  taskType: z.enum(['follow_telegram', 'follow_x', 'join_discord', 'follow_instagram', 'like_post', 'retweet', 'custom']),
  actionUrl: z.string().url().optional(),
  pointsReward: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  requiresVerification: z.boolean().default(false),
  verificationMethod: z.string().optional(),
  metadata: z.record(z.any()).optional(),
})

const updateTaskSchema = createTaskSchema.partial()

router.use(authenticate)
router.use(requireAdmin)

router.get('/', requirePermission('tasks', 'read'), async (req: AuthRequest, res, next) => {
  try {
    const isActive = req.query.active === 'true' ? true : req.query.active === 'false' ? false : undefined

    const filter: any = {}
    if (isActive !== undefined) {
      filter.isActive = isActive
    }

    const tasks = await Task.find(filter).sort({ createdAt: -1 })

    res.json({
      success: true,
      data: {
        tasks,
      },
    })
  } catch (error) {
    next(error)
  }
})

router.get('/:taskId', requirePermission('tasks', 'read'), async (req: AuthRequest, res, next) => {
  try {
    const { taskId } = req.params

    const task = await Task.findById(taskId)

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found',
      })
    }

    res.json({
      success: true,
      data: task,
    })
  } catch (error) {
    next(error)
  }
})

router.post('/', requirePermission('tasks', 'write'), async (req: AuthRequest, res, next) => {
  try {
    const validatedData = createTaskSchema.parse(req.body)

    const task = await Task.create({
      title: validatedData.title,
      description: validatedData.description,
      taskType: validatedData.taskType,
      actionUrl: validatedData.actionUrl,
      pointsReward: validatedData.pointsReward,
      isActive: validatedData.isActive,
      requiresVerification: validatedData.requiresVerification,
      verificationMethod: validatedData.verificationMethod,
      metadata: validatedData.metadata,
      createdBy: req.user?.id,
    })

    logInfo('Task created', { taskId: (task._id as mongoose.Types.ObjectId).toString(), createdBy: req.user?.email })

    res.status(201).json({
      success: true,
      data: task,
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

router.patch('/:taskId', requirePermission('tasks', 'write'), async (req: AuthRequest, res, next) => {
  try {
    const { taskId } = req.params
    const validatedData = updateTaskSchema.parse(req.body)

    const updateData: any = {}
    if (validatedData.title !== undefined) updateData.title = validatedData.title
    if (validatedData.description !== undefined) updateData.description = validatedData.description
    if (validatedData.taskType !== undefined) updateData.taskType = validatedData.taskType
    if (validatedData.actionUrl !== undefined) updateData.actionUrl = validatedData.actionUrl
    if (validatedData.pointsReward !== undefined) updateData.pointsReward = validatedData.pointsReward
    if (validatedData.isActive !== undefined) updateData.isActive = validatedData.isActive
    if (validatedData.requiresVerification !== undefined) updateData.requiresVerification = validatedData.requiresVerification
    if (validatedData.verificationMethod !== undefined) updateData.verificationMethod = validatedData.verificationMethod
    if (validatedData.metadata !== undefined) updateData.metadata = validatedData.metadata

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update',
      })
    }

    const task = await Task.findByIdAndUpdate(taskId, updateData, { new: true })

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found',
      })
    }

    logInfo('Task updated', { taskId, updatedBy: req.user?.email })

    res.json({
      success: true,
      data: task,
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

router.delete('/:taskId', requirePermission('tasks', 'delete'), async (req: AuthRequest, res, next) => {
  try {
    const { taskId } = req.params

    const task = await Task.findByIdAndDelete(taskId)

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found',
      })
    }

    logWarn('Task deleted', { taskId, deletedBy: req.user?.email })

    res.json({
      success: true,
      message: 'Task deleted successfully',
    })
  } catch (error) {
    next(error)
  }
})

router.get('/user/:userId/completions', requirePermission('tasks', 'read'), async (req: AuthRequest, res, next) => {
  try {
    const { userId } = req.params

    const completions = await UserTask.find({ userId })
      .populate('taskId', 'title description taskType pointsReward')
      .sort({ createdAt: -1 })
      .lean()

    const formattedCompletions = completions.map(completion => ({
      ...completion,
      title: (completion.taskId as any)?.title,
      description: (completion.taskId as any)?.description,
      task_type: (completion.taskId as any)?.taskType,
      points_reward: (completion.taskId as any)?.pointsReward,
    }))

    res.json({
      success: true,
      data: {
        completions: formattedCompletions,
      },
    })
  } catch (error) {
    next(error)
  }
})

// User routes - get available tasks (accessible to all authenticated users regardless of status)
router.get('/user/available', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const userEmail = req.user?.email
    if (!userEmail) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      })
    }

    // Verify user exists (but don't restrict by status - all users can see tasks)
    const user = await User.findOne({ email: userEmail })
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      })
    }

    // Get all active tasks - visible to all authenticated users (new and old)
    const tasks = await Task.find({ isActive: true }).sort({ createdAt: -1 })
    
    // Get user's task completions
    const userTasks = await UserTask.find({ userId: user._id })
    
    // Map tasks with user completion status
    const tasksWithStatus = tasks.map((task: ITask) => {
      const userTask = userTasks.find(ut => ut.taskId.toString() === (task._id as mongoose.Types.ObjectId).toString())
      return {
        _id: task._id,
        title: task.title,
        description: task.description,
        taskType: task.taskType,
        actionUrl: task.actionUrl,
        pointsReward: task.pointsReward,
        requiresVerification: task.requiresVerification,
        verificationMethod: task.verificationMethod,
        status: userTask?.status || 'pending',
        submissionLink: userTask?.submissionLink,
        submittedAt: userTask?.submittedAt,
        reviewedAt: userTask?.reviewedAt,
        rejectionReason: userTask?.rejectionReason,
        pointsAwarded: userTask?.pointsAwarded || false,
      }
    })

    res.json({
      success: true,
      data: {
        tasks: tasksWithStatus,
      },
    })
  } catch (error) {
    next(error)
  }
})

// Submit task completion with link (for review)
router.post('/:taskId/submit', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { taskId } = req.params
    const { submissionLink } = req.body
    const userEmail = req.user?.email

    if (!userEmail) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      })
    }

    if (!submissionLink) {
      return res.status(400).json({
        success: false,
        message: 'Submission link is required',
      })
    }

    // Validate URL
    try {
      new URL(submissionLink)
    } catch {
      return res.status(400).json({
        success: false,
        message: 'Invalid URL format',
      })
    }

    const user = await User.findOne({ email: userEmail })
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      })
    }

    const task = await Task.findOne({ _id: taskId, isActive: true })
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found or inactive',
      })
    }

    let userTask = await UserTask.findOne({ userId: user._id, taskId: task._id })

    if (userTask && ['approved', 'completed'].includes(userTask.status)) {
      return res.status(400).json({
        success: false,
        message: 'Task already completed',
      })
    }

    if (userTask) {
      userTask.status = 'submitted'
      userTask.submissionLink = submissionLink
      userTask.submittedAt = new Date()
      await userTask.save()
    } else {
      userTask = await UserTask.create({
        userId: user._id,
        taskId: task._id,
        status: 'submitted',
        submissionLink,
        submittedAt: new Date(),
      })
    }

    logInfo('Task submission received', { 
      taskId, 
      userId: (user._id as mongoose.Types.ObjectId).toString(),
      submissionLink 
    })

    res.json({
      success: true,
      message: 'Task submitted for review',
      data: userTask,
    })
  } catch (error) {
    next(error)
  }
})

// Complete task (for tasks that don't require review)
router.post('/:taskId/complete', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { taskId } = req.params
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

    const task = await Task.findOne({ _id: taskId, isActive: true })
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found or inactive',
      })
    }

    // If task requires verification, it must be submitted first
    if (task.requiresVerification) {
      return res.status(400).json({
        success: false,
        message: 'This task requires submission for review. Please use the submit endpoint.',
      })
    }

    let userTask = await UserTask.findOne({ userId: user._id, taskId: task._id })

    if (userTask && ['completed', 'approved'].includes(userTask.status)) {
      return res.status(400).json({
        success: false,
        message: 'Task already completed',
      })
    }

    const verificationData = req.body.verificationData || {}

    if (userTask) {
      userTask.status = 'completed'
      userTask.completedAt = new Date()
      userTask.verificationData = verificationData
      await userTask.save()
    } else {
      userTask = await UserTask.create({
        userId: user._id,
        taskId: task._id,
        status: 'completed',
        completedAt: new Date(),
        verificationData,
      })
    }

    if (task.pointsReward > 0) {
      const pointsResult = await awardPoints(
        (user._id as mongoose.Types.ObjectId).toString(),
        task.pointsReward,
        `Task completed: ${task.title}`,
        { taskId: taskId, taskType: task.taskType }
      )

      if (pointsResult.success) {
        userTask.pointsAwarded = true
        await userTask.save()
      }
    }

    res.json({
      success: true,
      message: 'Task completed successfully',
      data: userTask,
    })
  } catch (error) {
    next(error)
  }
})

// Admin routes for reviewing submissions
router.get('/submissions/pending', requireAdmin, requirePermission('tasks', 'read'), async (req: AuthRequest, res, next) => {
  try {
    const submissions = await UserTask.find({ status: 'submitted' })
      .populate('userId', 'email name')
      .populate('taskId', 'title description taskType pointsReward')
      .sort({ submittedAt: -1 })
      .lean()

    res.json({
      success: true,
      data: {
        submissions,
      },
    })
  } catch (error) {
    next(error)
  }
})

router.post('/submissions/:submissionId/approve', requireAdmin, requirePermission('tasks', 'write'), async (req: AuthRequest, res, next) => {
  try {
    const { submissionId } = req.params
    const userTask = await UserTask.findById(submissionId).populate('taskId')

    if (!userTask) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found',
      })
    }

    if (userTask.status !== 'submitted') {
      return res.status(400).json({
        success: false,
        message: 'Submission is not in submitted status',
      })
    }

    userTask.status = 'approved'
    userTask.reviewedAt = new Date()
    if (req.user?.id) {
      userTask.reviewedBy = new mongoose.Types.ObjectId(String(req.user.id))
    }
    userTask.completedAt = new Date()
    await userTask.save()

    const task = userTask.taskId as any
    if (task.pointsReward > 0) {
      const pointsResult = await awardPoints(
        (userTask.userId as mongoose.Types.ObjectId).toString(),
        task.pointsReward,
        `Task approved: ${task.title}`,
        { taskId: task._id.toString(), taskType: task.taskType }
      )

      if (pointsResult.success) {
        userTask.pointsAwarded = true
        await userTask.save()
      }
    }

    logInfo('Task submission approved', { 
      submissionId, 
      approvedBy: req.user?.email 
    })

    res.json({
      success: true,
      message: 'Submission approved successfully',
      data: userTask,
    })
  } catch (error) {
    next(error)
  }
})

router.post('/submissions/:submissionId/reject', requireAdmin, requirePermission('tasks', 'write'), async (req: AuthRequest, res, next) => {
  try {
    const { submissionId } = req.params
    const { rejectionReason } = req.body

    const userTask = await UserTask.findById(submissionId)

    if (!userTask) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found',
      })
    }

    if (userTask.status !== 'submitted') {
      return res.status(400).json({
        success: false,
        message: 'Submission is not in submitted status',
      })
    }

    userTask.status = 'rejected'
    userTask.reviewedAt = new Date()
    if (req.user?.id) {
      userTask.reviewedBy = new mongoose.Types.ObjectId(String(req.user.id))
    }
    userTask.rejectionReason = rejectionReason || 'Submission does not meet requirements'
    await userTask.save()

    logInfo('Task submission rejected', { 
      submissionId, 
      rejectedBy: req.user?.email,
      reason: rejectionReason 
    })

    res.json({
      success: true,
      message: 'Submission rejected',
      data: userTask,
    })
  } catch (error) {
    next(error)
  }
})

export default router

