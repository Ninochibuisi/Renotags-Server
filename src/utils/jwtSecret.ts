import { logError } from './logger.js'
import type { Secret } from 'jsonwebtoken'

/**
 * Gets and validates the JWT secret from environment variables.
 * Throws an error if not configured (for use in initialization).
 * Returns a properly typed Secret for use in JWT operations.
 */
export function getJwtSecret(): Secret {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    const error = new Error('JWT_SECRET is not configured in environment variables')
    logError('JWT_SECRET validation failed', error)
    throw error
  }
  return secret as Secret
}

/**
 * Safely gets the JWT secret, returning null if not configured.
 * Use this when you want to handle the error gracefully in route handlers.
 */
export function getJwtSecretOrNull(): Secret | null {
  return (process.env.JWT_SECRET as Secret) || null
}

