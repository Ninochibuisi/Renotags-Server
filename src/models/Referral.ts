import mongoose, { Schema, Document, Types } from 'mongoose'

export interface IReferral extends Document {
  referrerId: Types.ObjectId
  referredEmail: string
  referredName?: string
  status: 'pending' | 'completed'
  emailVerified: boolean
  telegramVerified: boolean
  telegramFollowed: boolean
  renopaysTagCreated: boolean
  allVerificationsComplete: boolean
  pointsAwarded: boolean
  completedAt?: Date
  createdAt: Date
  updatedAt: Date
}

const ReferralSchema = new Schema<IReferral>(
  {
    referrerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    referredEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true
    },
    referredName: {
      type: String,
      trim: true
    },
    status: {
      type: String,
      enum: ['pending', 'completed'],
      default: 'pending',
      index: true
    },
    emailVerified: {
      type: Boolean,
      default: false
    },
    telegramVerified: {
      type: Boolean,
      default: false
    },
    telegramFollowed: {
      type: Boolean,
      default: false
    },
    renopaysTagCreated: {
      type: Boolean,
      default: false
    },
    allVerificationsComplete: {
      type: Boolean,
      default: false,
      index: true
    },
    pointsAwarded: {
      type: Boolean,
      default: false
    },
    completedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
)

// Compound index for unique referral per referrer
ReferralSchema.index({ referrerId: 1, referredEmail: 1 }, { unique: true })

export const Referral = mongoose.model<IReferral>('Referral', ReferralSchema)


