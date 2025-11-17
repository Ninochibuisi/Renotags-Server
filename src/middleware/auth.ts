import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { AdminUser } from '../models/AdminUser.js'
import { logWarn, logError } from '../utils/logger.js'
import { getJwtSecret } from '../utils/jwtSecret.js'

export interface AuthRequest extends Request {
  user?: {
    id: number | string
    email: string
    role: string
    permissions?: any
  }
}

export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      })
    }

    const jwtSecret = getJwtSecret()
    const decoded = jwt.verify(
      token,
      jwtSecret
    ) as { id: number | string; email: string; role: string }

    req.user = decoded
    next()
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
    })
  }
}

export const requireAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
    })
  }

  if (req.user.role === 'admin' || req.user.role === 'super_admin' || req.user.role === 'moderator' || req.user.role === 'viewer') {
    try {
      const admin = await AdminUser.findOne({ 
        email: req.user.email.toLowerCase(),
        isActive: true 
      }).select('role permissions isActive')

      if (!admin || !admin.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required',
        })
      }

      req.user.role = admin.role || 'admin'
      req.user.permissions = admin.permissions
      return next()
    } catch (error) {
      logWarn('Error checking admin permissions', error)
      return res.status(403).json({
        success: false,
        message: 'Admin access required',
      })
    }
  }

  return res.status(403).json({
    success: false,
    message: 'Admin access required',
  })
}

export const requirePermission = (resource: string, action: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !req.user.permissions) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied',
      })
    }

    const permissions = req.user.permissions as any
    const resourcePerms = permissions[resource] as string[]

    if (!resourcePerms || !resourcePerms.includes(action)) {
      return res.status(403).json({
        success: false,
        message: `Permission denied: ${action} on ${resource}`,
      })
    }

    next()
  }
}

export const requireSuperAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user || req.user.role !== 'super_admin') {
    return res.status(403).json({
      success: false,
      message: 'Super admin access required',
    })
  }
  next()
}
