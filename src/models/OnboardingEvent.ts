import mongoose, { Schema, Document, Types } from 'mongoose'

export interface IOnboardingEvent extends Document {
  userId: Types.ObjectId
  eventType: string
  eventData?: any
  createdAt: Date
}

const OnboardingEventSchema = new Schema<IOnboardingEvent>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    eventType: {
      type: String,
      required: true,
      index: true
    },
    eventData: {
      type: Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false }
  }
)

// Compound index for querying events by user and type
OnboardingEventSchema.index({ userId: 1, eventType: 1, createdAt: -1 })

export const OnboardingEvent = mongoose.model<IOnboardingEvent>('OnboardingEvent', OnboardingEventSchema)


