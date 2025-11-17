import { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'
import { logError } from '../utils/logger.js'

export const errorHandler = (
  err: Error | ZodError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  logError('Request error', { error: err.message, stack: err.stack, path: req.path })

  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: err.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    })
  }

  res.status(500).json({
    success: false,
    message: err.message || 'Internal server error',
  })
}
