import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { securityConfig } from '../config/app.config';
import { redisClient } from '../config/redis';

// Extend Express Request interface to include user
declare global {
     namespace Express {
          interface Request {
               user?: any;
          }
     }
}

export const authenticate = async (
     req: Request,
     res: Response,
     next: NextFunction
): Promise<any> => {
     try {
          const authHeader = req.headers.authorization;

          if (!authHeader || !authHeader.startsWith('Bearer ')) {
               return res.status(401).json({
                    message: 'Authorization token is missing or invalid',
               });
          }

          const token = authHeader.split(' ')[1];

          if (!securityConfig.jwtSecret) {
               throw new Error('JWT secret is not configured');
          }

          const decoded = jwt.verify(
               token,
               securityConfig.jwtSecret
          ) as jwt.JwtPayload;

          // Enforce active session per-device limit check
          if (decoded && decoded.id) {
               const deviceId = decoded.deviceId || 'unknown_device';
               const activeSessionId = await redisClient.get(
                    `active_session_id:${decoded.id}:${deviceId}`
               );
               if (!activeSessionId || decoded.sessionId !== activeSessionId) {
                    return res.status(401).json({
                         message: 'Session is invalid or logged in from another device',
                    });
               }
          }

          req.user = decoded;

          next();
     } catch (error: any) {
          if (error.name === 'TokenExpiredError') {
               return res.status(401).json({ message: 'Token has expired' });
          }
          return res.status(401).json({ message: 'Invalid token' });
     }
};
