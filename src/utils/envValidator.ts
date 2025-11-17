import { z } from 'zod'
import { logError, logWarn } from './logger.js'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3001'),
  FRONTEND_URL: z.string().url(),

  MONGODB_URI: z.string().url(),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  EMAIL_HOST: z.string().optional(),
  EMAIL_PORT: z.string().default('587'),
  EMAIL_USER: z.string().optional(),
  EMAIL_PASS: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),

  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
})

export type EnvConfig = z.infer<typeof envSchema>

let validatedEnv: EnvConfig | null = null

export const validateEnv = (): EnvConfig => {
  if (validatedEnv) {
    return validatedEnv
  }

  try {
    validatedEnv = envSchema.parse(process.env)
    return validatedEnv
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('\n')
      logError('Environment validation failed', { errors: error.errors })
      throw new Error(
        `❌ Environment validation failed:\n${missingVars}\n\nPlease check your .env file.`
      )
    }
    throw error
  }
}

try {
  validateEnv()
} catch (error) {
  if (process.env.NODE_ENV === 'production') {
    throw error
  } else {
    logWarn('Environment validation warning', error)
  }
}
