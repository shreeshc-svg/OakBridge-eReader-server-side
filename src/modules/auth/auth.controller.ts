import { Request, Response } from 'express';
import { auth_service } from './auth.service';
import { securityConfig } from '../../config/app.config';
import { UAParser } from 'ua-parser-js';
import { logActivity } from '../../utils/audit_logger';
import { sendWelcomeMail } from '../../utils/mail.service';

export const auth_controller = {
     async send_otp(req: Request, res: Response) {
          try {
               const { email } = req.body;

               if (!email) {
                    return res
                         .status(400)
                         .json({ message: 'Email is required' });
               }

               const result = await auth_service.send_otp(email);
               return res.status(200).json(result);
          } catch (error: any) {
               return res
                    .status(400)
                    .json({ message: error.message || 'Something went wrong' });
          }
     },

     async register(req: Request, res: Response) {
          try {
               const { username, email, password, role, otp } = req.body;

               // Validate required inputs
               if (!username || !email || !password || !role || !otp) {
                    return res.status(400).json({
                         message: 'username, email, password, role, and otp are all required',
                    });
               }

               // Verify and create the user
               const user = await auth_service.create_user({
                    username,
                    email,
                    password,
                    role,
                    otp,
               });

               await logActivity(user.id, user.username, 'REGISTER', { email: user.email, role: user.role }, req.ip);

               // Send welcome email asynchronously
               sendWelcomeMail(user.email, user.username || 'Reader').catch((mailErr) => {
                    console.error('SMTP: Failed to send welcome email to standard user:', mailErr);
               });

               return res.status(201).json({
                    message: 'User registered successfully',
                    user,
               });
          } catch (error: any) {
               return res
                    .status(400)
                    .json({ message: error.message || 'Registration failed' });
          }
     },

     async login_user(req: Request, res: Response) {
          try {
               const { email, password, deviceId, deviceName } = req.body;
               // validate required inputs

               if (!email || !password) {
                    return res.status(400).json({
                         message: 'Email and password are required',
                    });
               }

               // fetch and parse the user-agent header
               const user_agent_string = req.headers['user-agent'] || '';
               const parser = new UAParser(user_agent_string);
               const device = parser.getDevice();

               // map the parsed device type to our specific categories
               let device_type: 'laptop' | 'mobile' | 'tablet' = 'laptop';

               if (device.type === 'mobile') {
                    device_type = 'mobile';
               } else if (device.type === 'tablet') {
                    device_type = 'tablet';
               }

               // perform login through auth service
               const result = await auth_service.login_user({
                    email,
                    password,
                    device_type,
                    deviceId,
                    deviceName,
               } as any);

               // secure set the refresh token as an HttpOnly cookie
               res.cookie('refresh_token', result.refresh_token, {
                    httpOnly: true,
                    secure: securityConfig.node_env === 'production',
                    sameSite: 'strict',
                    maxAge: 7 * 24 * 60 * 60 * 1000,
               });

               await logActivity(result.user.id, result.user.username, 'LOGIN', { email: result.user.email, role: result.user.role }, req.ip);

               return res.status(200).json({
                    message: 'Login Successful',
                    user: result.user,
                    access_token: result.access_token,
                    refresh_token: result.refresh_token,
               });
          } catch (error: any) {
               return res.status(400).json({
                    message: error.message || 'Login Failed',
               });
          }
     },

     async get_me(req: Request, res: Response) {
          try {
               const userId = req.user?.id;

               if (!userId) {
                    return res.status(401).json({
                         message: 'Unauthorized',
                    });
               }

               const user = await auth_service.get_me(userId);

               return res.status(200).json({
                    message: 'User details fetched successfully',
                    user,
               });
          } catch (error: any) {
               console.error('get_me error:', error);
               return res.status(400).json({
                    message: error.message || 'Failed to fetch user details',
               });
          }
     },

     async refresh_token(req: Request, res: Response) {
          try {
               const authHeader = req.headers.authorization;
               const old_access_token = authHeader?.startsWith('Bearer ')
                    ? authHeader.split(' ')[1]
                    : null;
               const refresh_token =
                    req.body?.refresh_token || req.cookies?.refresh_token;

               if (!old_access_token) {
                    return res.status(401).json({
                         message: 'Authorization token is missing or invalid',
                    });
               }

               if (!refresh_token) {
                    return res.status(401).json({
                         message: 'Refresh token is required',
                    });
               }

               const user_agent_string = req.headers['user-agent'] || '';
               const parser = new UAParser(user_agent_string);
               const device = parser.getDevice();

               let device_type: 'laptop' | 'mobile' | 'tablet' = 'laptop';
               if (device.type === 'mobile') {
                    device_type = 'mobile';
               } else if (device.type === 'tablet') {
                    device_type = 'tablet';
               }

               const result = await auth_service.refresh_token(
                    old_access_token,
                    refresh_token,
                    device_type
               );

               res.cookie('refresh_token', result.refresh_token, {
                    httpOnly: true,
                    secure: securityConfig.node_env === 'production',
                    sameSite: 'strict',
                    maxAge: 7 * 24 * 60 * 60 * 1000,
               });

               return res.status(200).json({
                    message: 'Token refreshed successfully',
                    access_token: result.access_token,
                    refresh_token: result.refresh_token,
               });
          } catch (error: any) {
               return res.status(401).json({
                    message: error.message || 'Failed to refresh token',
               });
          }
     },

     async logout_user(req: Request, res: Response) {
          try {
               const { userId } = req.body;

               const refresh_token = req.cookies?.refresh_token;

               if (!userId) {
                    return res
                         .status(400)
                         .json({ message: 'User ID is required' });
               }

               if (!refresh_token) {
                    return res.status(400).json({
                         message: 'No refresh token found to log out',
                    });
               }

               const user_agent_string = req.headers['user-agent'] || '';
               const parser = new UAParser(user_agent_string);
               const device = parser.getDevice();

               let device_type: 'laptop' | 'mobile' | 'tablet' = 'laptop';
               if (device.type === 'mobile') {
                    device_type = 'mobile';
               } else if (device.type === 'tablet') {
                    device_type = 'tablet';
               }

               let deviceId = req.body.deviceId;
               if (!deviceId) {
                    try {
                         const authHeader = req.headers.authorization;
                         if (authHeader && authHeader.startsWith('Bearer ')) {
                              const token = authHeader.split(' ')[1];
                              const payloadBase64 = token.split('.')[1];
                              const payload = JSON.parse(
                                   Buffer.from(
                                        payloadBase64,
                                        'base64'
                                   ).toString('utf8')
                              );
                              deviceId = payload.deviceId;
                         }
                    } catch (e) {}
               }

               // Call the service to remove the session from Redis
               const result = await auth_service.logout_user(
                    userId,
                    device_type,
                    refresh_token,
                    deviceId
               );
               // Clear the cookie from the browser

               res.clearCookie('refresh_token', {
                    httpOnly: true,
                    secure: securityConfig.node_env === 'production',
                    sameSite: 'strict',
               });

               await logActivity(userId, null, 'LOGOUT', null, req.ip);

               return res.status(200).json(result);
          } catch (error: any) {
               return res.status(400).json({
                    message: error.message || 'Logout Failed',
               });
          }
     },

     async send_institution_otp(req: Request, res: Response) {
          try {
               const { email } = req.body;

               if (!email) {
                    return res
                         .status(400)
                         .json({ message: 'Email is required' });
               }

               const result = await auth_service.send_institution_otp(email);
               return res.status(200).json(result);
          } catch (error: any) {
               return res
                    .status(400)
                    .json({ message: error.message || 'Something went wrong' });
          }
     },

     async login_institution(req: Request, res: Response) {
          try {
               const {
                    email,
                    otp,
                    institution_name,
                    location,
                    deviceId,
                    deviceName,
               } = req.body;

               if (!email || !otp) {
                    return res.status(400).json({
                         message: 'Email and OTP are required',
                    });
               }

               const user_agent_string = req.headers['user-agent'] || '';
               const parser = new UAParser(user_agent_string);
               const device = parser.getDevice();

               let device_type: 'laptop' | 'mobile' | 'tablet' = 'laptop';
               if (device.type === 'mobile') {
                    device_type = 'mobile';
               } else if (device.type === 'tablet') {
                    device_type = 'tablet';
               }

               const result = await auth_service.login_institution({
                    email,
                    otp,
                    institution_name,
                    location,
                    device_type,
                    deviceId,
                    deviceName,
               });

               res.cookie('refresh_token', result.refresh_token, {
                    httpOnly: true,
                    secure: securityConfig.node_env === 'production',
                    sameSite: 'strict',
                    maxAge: 7 * 24 * 60 * 60 * 1000,
               });

               return res.status(200).json({
                    message: 'Institution Login Successful',
                    user: result.user,
                    access_token: result.access_token,
                    refresh_token: result.refresh_token,
               });
          } catch (error: any) {
               return res.status(400).json({
                    message: error.message || 'Login/Registration Failed',
               });
          }
     },

     async get_admins(req: Request, res: Response): Promise<any> {
          try {
               const admins = await auth_service.get_admins();
               return res.status(200).json({
                    admins,
               });
          } catch (error: any) {
               return res.status(400).json({
                    message: error.message || 'Failed to fetch admins',
               });
          }
     },

     async add_admin(req: Request, res: Response): Promise<any> {
          try {
               const { username, email, password } = req.body;
               if (!username || !email || !password) {
                    return res.status(400).json({
                         message: 'Name, email and password are required',
                    });
               }
               const admin = await auth_service.add_admin({
                    username,
                    email,
                    password,
               });
               await logActivity(req.user?.id, req.user?.username, 'ADD_ADMIN', { adminEmail: admin.email, adminUsername: admin.username }, req.ip);
               return res.status(201).json({
                    message: 'Admin added successfully',
                    admin,
               });
          } catch (error: any) {
               return res.status(400).json({
                    message: error.message || 'Failed to add admin',
               });
          }
     },

     async remove_admin(req: Request, res: Response): Promise<any> {
          try {
               const adminId = req.params.id as string;
               if (!adminId) {
                    return res.status(400).json({
                         message: 'Admin ID is required',
                    });
               }
               const result = await auth_service.remove_admin(adminId);
               await logActivity(req.user?.id, req.user?.username, 'REMOVE_ADMIN', { removedAdminId: adminId }, req.ip);
               return res.status(200).json(result);
          } catch (error: any) {
               return res.status(400).json({
                    message: error.message || 'Failed to remove admin',
               });
          }
     },

     async get_managers(req: Request, res: Response): Promise<any> {
          try {
               const managers = await auth_service.get_managers();
               return res.status(200).json({
                    managers,
               });
          } catch (error: any) {
               return res.status(400).json({
                    message: error.message || 'Failed to fetch managers',
               });
          }
     },

     async add_manager(req: Request, res: Response): Promise<any> {
          try {
               const { username, email, password } = req.body;
               if (!username || !email || !password) {
                    return res.status(400).json({
                         message: 'Name, email and password are required',
                    });
               }
               const manager = await auth_service.add_manager({
                    username,
                    email,
                    password,
               });
               await logActivity(req.user?.id, req.user?.username, 'ADD_MANAGER', { managerEmail: manager.email, managerUsername: manager.username }, req.ip);
               return res.status(201).json({
                    message: 'Manager added successfully',
                    manager,
               });
          } catch (error: any) {
               return res.status(400).json({
                    message: error.message || 'Failed to add manager',
               });
          }
     },

     async remove_manager(req: Request, res: Response): Promise<any> {
          try {
               const managerId = req.params.id as string;
               if (!managerId) {
                    return res.status(400).json({
                         message: 'Manager ID is required',
                    });
               }
               const result = await auth_service.remove_manager(managerId);
               await logActivity(req.user?.id, req.user?.username, 'REMOVE_MANAGER', { removedManagerId: managerId }, req.ip);
               return res.status(200).json(result);
          } catch (error: any) {
               return res.status(400).json({
                    message: error.message || 'Failed to remove manager',
               });
          }
     },

     async forgot_password(req: Request, res: Response) {
          try {
               const { email } = req.body;
               if (!email) {
                    return res.status(400).json({ message: 'Email address is required.' });
               }

               const result = await auth_service.forgot_password(email);
               return res.status(200).json(result);
          } catch (error: any) {
               return res.status(400).json({ message: error.message || 'Failed to process forgot password request.' });
          }
     },

     async reset_password(req: Request, res: Response) {
          try {
               const { token, new_password } = req.body;
               if (!token || !new_password) {
                    return res.status(400).json({ message: 'Token and new password are required.' });
               }

               const result = await auth_service.reset_password(token, new_password);
               return res.status(200).json(result);
          } catch (error: any) {
               return res.status(400).json({ message: error.message || 'Failed to reset password.' });
          }
     },

     async update_profile(req: Request, res: Response) {
          try {
               const userId = (req as any).user.id;
               const {
                    username,
                    email,
                    password,
                    billing_address_line1,
                    billing_address_line2,
                    billing_city,
                    billing_state,
                    billing_postal_code,
                    billing_country,
                    marketing_emails,
               } = req.body;

               const updatedUser = await auth_service.update_profile(userId, {
                    username,
                    email,
                    password,
                    billing_address_line1,
                    billing_address_line2,
                    billing_city,
                    billing_state,
                    billing_postal_code,
                    billing_country,
                    marketing_emails,
               });

               return res.status(200).json({
                    success: true,
                    message: 'Profile updated successfully',
                    user: updatedUser,
               });
          } catch (error: any) {
               return res.status(400).json({
                    success: false,
                    message: error.message || 'Failed to update profile',
               });
          }
     },
};
