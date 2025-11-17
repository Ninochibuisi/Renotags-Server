import { Request, Response, NextFunction } from 'express'
import { AuditLog } from '../models/AuditLog.js'
import { AuthRequest } from './auth.js'

export const auditLog = (action: string, resourceType?: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res)
    
    res.json = function (data: any) {
      if (req.user && res.statusCode < 400) {
        const resourceId = req.params.userId || req.params.taskId || req.params.id || null
        
        AuditLog.create({
          adminId: req.user.id,
          action,
          resourceType: resourceType || undefined,
          resourceId: resourceId || undefined,
          details: {
            method: req.method,
            path: req.path,
            body: req.method !== 'GET' ? req.body : null,
          },
          ipAddress: req.ip || req.socket.remoteAddress,
          userAgent: req.get('user-agent'),
        }).catch((err) => {
          // Silently fail - audit logging should not block requests
        })
      }
      
      return originalJson(data)
    }
    
    next()
  }
}

