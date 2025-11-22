import mongoose, { Schema, Document, Types } from 'mongoose'

export interface IUserTask extends Document {
  userId: Types.ObjectId
  taskId: Types.ObjectId
  status: 'pending' | 'submitted' | 'approved' | 'rejected' | 'completed'
  completedAt?: Date
  verifiedAt?: Date
  submittedAt?: Date
  reviewedAt?: Date
  reviewedBy?: Types.ObjectId
  submissionLink?: string
  verificationData?: any
  rejectionReason?: string
  pointsAwarded: boolean
  createdAt: Date
  updatedAt: Date
}

const UserTaskSchema = new Schema<IUserTask>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    taskId: {
      type: Schema.Types.ObjectId,
      ref: 'Task',
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ['pending', 'submitted', 'approved', 'rejected', 'completed'],
      default: 'pending',
      index: true
    },
    completedAt: {
      type: Date,
      default: null
    },
    verifiedAt: {
      type: Date,
      default: null
    },
    submittedAt: {
      type: Date,
      default: null
    },
    reviewedAt: {
      type: Date,
      default: null
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: 'AdminUser',
      default: null
    },
    submissionLink: {
      type: String,
      trim: true,
      default: null
    },
    verificationData: {
      type: Schema.Types.Mixed,
      default: {}
    },
    rejectionReason: {
      type: String,
      trim: true,
      default: null
    },
    pointsAwarded: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
)

// Compound index for unique user-task combination
UserTaskSchema.index({ userId: 1, taskId: 1 }, { unique: true })
// Index for querying by user and status
UserTaskSchema.index({ userId: 1, status: 1 })

export const UserTask = mongoose.model<IUserTask>('UserTask', UserTaskSchema)


