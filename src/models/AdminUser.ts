import mongoose, { Schema, Document } from 'mongoose'

export interface IAdminUser extends Document {
  email: string
  passwordHash: string
  role: string
  permissions?: any
  isActive: boolean
  lastLogin?: Date
  createdAt: Date
  updatedAt: Date
}

const AdminUserSchema = new Schema<IAdminUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    passwordHash: {
      type: String,
      required: true,
      select: false
    },
    role: {
      type: String,
      enum: ['super_admin', 'admin', 'moderator', 'viewer'],
      default: 'admin',
      index: true
    },
    permissions: {
      type: Schema.Types.Mixed,
      default: null
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    lastLogin: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
)

export const AdminUser = mongoose.model<IAdminUser>('AdminUser', AdminUserSchema)


