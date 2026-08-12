import { Request, Response, NextFunction } from 'express';

export const check_role = (allowedRoles: string[]) => {
     return (req: Request, res: Response, next: NextFunction): any => {
          try {
               const user = req.user;

               if (!user) {
                    return res.status(401).json({
                         message: 'Unauthorized: No user session found',
                    });
               }

               if (!allowedRoles.includes(user.role)) {
                    return res.status(403).json({
                         message: 'Forbidden: You do not have permission to perform this action',
                    });
               }

               next();
          } catch (error: any) {
               return res.status(500).json({
                    message: 'Internal Server error during role verification',
               });
          }
     };
};
