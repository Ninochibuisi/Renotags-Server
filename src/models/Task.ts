import mongoose, { Schema, Document, Types } from 'mongoose'

export interface ITask extends Document {
  title: string
  description?: string
  taskType: 'follow_telegram' | 'follow_x' | 'join_discord' | 'follow_instagram' | 'like_post' | 'retweet' | 'custom'
  actionUrl?: string
  pointsReward: number
  isActive: boolean
  requiresVerification: boolean
  verificationMethod?: string
  metadata?: any
  createdBy?: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const TaskSchema = new Schema<ITask>(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    taskType: {
      type: String,
      enum: ['follow_telegram', 'follow_x', 'join_discord', 'follow_instagram', 'like_post', 'retweet', 'custom'],
      required: true,
      index: true
    },
    actionUrl: {
      type: String,
      trim: true
    },
    pointsReward: {
      type: Number,
      default: 0,
      min: 0
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    requiresVerification: {
      type: Boolean,
      default: false
    },
    verificationMethod: {
      type: String,
      trim: true
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {}
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'AdminUser'
    }
  },
  {
    timestamps: true
  }
)

export const Task = mongoose.model<ITask>('Task', TaskSchema)


