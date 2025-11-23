import { z } from 'zod'

export const onboardingSchema = z.object({
  email: z
    .string()
    .email('Invalid email address')
    .min(5, 'Email must be at least 5 characters')
    .max(255, 'Email must be less than 255 characters')
    .toLowerCase()
    .trim(),
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be less than 100 characters')
    .trim(),
  interests: z
    .array(z.string())
    .min(1, 'Please select at least one interest')
    .max(10, 'Too many interests selected')
})

export type OnboardingInput = z.infer<typeof onboardingSchema>


