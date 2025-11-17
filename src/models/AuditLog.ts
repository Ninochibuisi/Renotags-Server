import mongoose, { Schema, Document, Types } from 'mongoose'

export interface IAuditLog extends Document {
  adminId: Types.ObjectId
  action: string
  resourceType?: string
  resourceId?: string
  details?: any
  ipAddress?: string
  userAgent?: string
  createdAt: Date
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    adminId: {
      type: Schema.Types.ObjectId,
      ref: 'AdminUser',
      required: true,
      index: true
    },
    action: {
      type: String,
      required: true,
      index: true
    },
    resourceType: {
      type: String,
      index: true
    },
    resourceId: {
      type: String,
      index: true
    },
    details: {
      type: Schema.Types.Mixed,
      default: {}
    },
    ipAddress: {
      type: String
    },
    userAgent: {
      type: String
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false }
  }
)

// Compound indexes for common queries
AuditLogSchema.index({ adminId: 1, createdAt: -1 })
AuditLogSchema.index({ action: 1, createdAt: -1 })

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema)


