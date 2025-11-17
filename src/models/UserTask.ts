import mongoose, { Schema, Document, Types } from 'mongoose'

export interface IUserTask extends Document {
  userId: Types.ObjectId
  taskId: Types.ObjectId
  status: 'pending' | 'completed'
  completedAt?: Date
  verifiedAt?: Date
  verificationData?: any
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
      enum: ['pending', 'completed'],
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
    verificationData: {
      type: Schema.Types.Mixed,
      default: {}
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


