import mongoose, { Schema, Document } from 'mongoose'

export interface IBotDetection extends Document {
  email?: string
  ipAddress?: string
  userAgent?: string
  fingerprint?: string
  suspiciousScore: number
  flaggedReasons?: any
  blocked: boolean
  createdAt: Date
}

const BotDetectionSchema = new Schema<IBotDetection>(
  {
    email: {
      type: String,
      lowercase: true,
      trim: true,
      index: true
    },
    ipAddress: {
      type: String,
      index: true
    },
    userAgent: {
      type: String
    },
    fingerprint: {
      type: String,
      index: true
    },
    suspiciousScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    flaggedReasons: {
      type: Schema.Types.Mixed,
      default: []
    },
    blocked: {
      type: Boolean,
      default: false,
      index: true
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false }
  }
)

export const BotDetection = mongoose.model<IBotDetection>('BotDetection', BotDetectionSchema)


