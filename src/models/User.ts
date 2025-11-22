import mongoose, { Schema, Document } from 'mongoose'

export interface IUser extends Document {
  email: string
  name: string
  password?: string
  walletAddress?: string
  interests: string[]
  status: 'pending' | 'onboarded' | 'active' | 'inactive'
  onboardingStep: number
  emailVerified: boolean
  emailVerificationToken?: string
  passwordResetToken?: string
  passwordResetExpires?: Date
  renopaysTag?: string
  points: number
  telegramVerified: boolean
  telegramUsername?: string
  telegramId?: string
  referredBy?: string // renopaysTag of the referrer (for backward compatibility)
  referredByUserId?: mongoose.Types.ObjectId // User ID of the referrer (for accurate tracking)
  referralCode?: string // User's own referral code (same as renopaysTag)
  telegramFollowed: boolean // Whether user follows Telegram channel
  successfulReferrals: number // Count of successful referrals
  banned: boolean // Whether user is banned
  banReason?: string // Reason for ban
  bannedUntil?: Date // Ban expiration date
  createdAt: Date
  updatedAt: Date
}

const UserSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    walletAddress: {
      type: String,
      trim: true,
      sparse: true
    },
    interests: {
      type: [String],
      default: []
    },
    status: {
      type: String,
      enum: ['pending', 'onboarded', 'active', 'inactive'],
      default: 'pending',
      index: true
    },
    onboardingStep: {
      type: Number,
      default: 1,
      min: 1,
      max: 5
    },
    emailVerified: {
      type: Boolean,
      default: false
    },
    emailVerificationToken: {
      type: String,
      select: false
    },
    passwordResetToken: {
      type: String,
      select: false
    },
    passwordResetExpires: {
      type: Date,
      select: false
    },
    password: {
      type: String,
      select: false
    },
    renopaysTag: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true
    },
    points: {
      type: Number,
      default: 0,
      min: 0
    },
    telegramVerified: {
      type: Boolean,
      default: false
    },
    telegramUsername: {
      type: String,
      trim: true
    },
    telegramId: {
      type: String,
      trim: true
    },
    referredBy: {
      type: String,
      trim: true,
      lowercase: true,
      index: true
    },
    referredByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    referralCode: {
      type: String,
      trim: true,
      lowercase: true,
      sparse: true
    },
    telegramFollowed: {
      type: Boolean,
      default: false
    },
    successfulReferrals: {
      type: Number,
      default: 0,
      min: 0
    },
    banned: {
      type: Boolean,
      default: false,
      index: true
    },
    banReason: {
      type: String,
      trim: true
    },
    bannedUntil: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
)

export const User = mongoose.model<IUser>('User', UserSchema)


