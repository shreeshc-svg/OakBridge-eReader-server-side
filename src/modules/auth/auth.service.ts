import { eq, InferInsertModel, or, asc, and } from 'drizzle-orm';
import * as crypto from 'crypto';
import { db } from '../../db/db';
import { users, institutions, user_devices } from '../../db/schemas';
import { otp_generation } from '../../utils/otp.generation';
import { redisClient } from '../../config/redis';
import { send_otp_mail, send_password_reset_mail } from '../../utils/mail.service';
import bcrypt from 'bcryptjs';
import { auth_repository } from './auth.repository';
import { securityConfig } from '../../config/app.config';
import jwt from 'jsonwebtoken';

type NewUser = InferInsertModel<typeof users>;

export const auth_service = {
     async send_otp(email: string) {
          // check if a user with this email already exists
          const existing_user = await db
               .select()
               .from(users)
               .where(eq(users.email, email))
               .limit(1);

          if (existing_user.length > 0) {
               throw new Error('Email is already registered');
          }

          // generate 6-digit numeric OTP
          const otp = otp_generation();

          // Store the OTP in Redis wiith 5 mins expiration
          const redis_key = `otp:${email}`;
          await redisClient.set(redis_key, otp, { EX: 300 });

          //   Send the OTP email using nodemailer
          await send_otp_mail(email, otp);

          return { message: 'OTP sent successfully to your email' };
     },

     async create_user(data: Omit<NewUser, 'id'> & { otp: string }) {
          const { username, email, password, role, otp } = data;

          //  verify otp from redis
          const redis_key = `otp:${email}`;
          const cached_otp = await redisClient.get(redis_key);

          if (!cached_otp) {
               throw new Error(
                    'OTP has expired or does not exists. Please request a new one'
               );
          }

          if (cached_otp !== otp) {
               throw new Error('Invalid OTP. Please try again.');
          }

          //  Check if username or email is already taken
          const existing_user = await db
               .select()
               .from(users)
               .where(or(eq(users.email, email), eq(users.username, username)))
               .limit(1);
          if (existing_user.length > 0) {
               const duplicate_field =
                    existing_user[0].email === email ? 'Email' : 'Username';
               throw new Error(`${duplicate_field} is already taken`);
          }

          //   Hash the password
          const hashed_password = await bcrypt.hash(password, 10);

          // 4. Generate user id and save via repository
          const created_user = await auth_repository.create_user({
               id: crypto.randomUUID(),
               username,
               email,
               password: hashed_password,
               role,
          });

          // 5. Delete OTP from Redis
          await redisClient.del(redis_key);
          // 6. Return created user (excluding password)
          const { password: _, ...user_without_password } = created_user;
          return user_without_password;
     },
     async login_user(
          data: NewUser & {
               device_type: 'laptop' | 'mobile' | 'tablet';
               deviceId?: string;
               deviceName?: string;
          }
     ) {
          const { email, password, device_type, deviceId, deviceName } = data;

          // find the user
          const user = await auth_repository.find_user_by_email(email);

          if (!user) {
               throw new Error('Invalid Email or Email not found');
          }

          // compare the password
          const isPasswordValid = await bcrypt.compare(password, user.password);

          if (!isPasswordValid) {
               throw new Error('Invalid Password');
          }

          const finalDeviceId = deviceId || 'unknown_device';
          const finalDeviceName = deviceName || `Unknown ${device_type}`;

          // 1. Manage user_devices table
          const userDevices = await db
               .select()
               .from(user_devices)
               .where(eq(user_devices.userId, user.id))
               .orderBy(asc(user_devices.lastActiveAt));

          const existingDevice = userDevices.find(
               (d) => d.deviceId === finalDeviceId
          );

          if (existingDevice) {
               // Update last active time for the existing device
               await db
                    .update(user_devices)
                    .set({ lastActiveAt: new Date() })
                    .where(eq(user_devices.id, existingDevice.id));
          } else {
               // If it's a new device, check if user already has 3 devices registered
               if (userDevices.length >= 3) {
                    // Option B: Automatically delete the oldest device
                    const oldestDevice = userDevices[0];
                    await db
                         .delete(user_devices)
                         .where(eq(user_devices.id, oldestDevice.id));

                    // Invalidate the session on the de-registered device
                    await redisClient.del(
                         `active_session_id:${user.id}:${oldestDevice.deviceId}`
                    );
               }

               // Register the new device
               await db.insert(user_devices).values({
                    id: crypto.randomUUID(),
                    userId: user.id,
                    deviceId: finalDeviceId,
                    deviceName: finalDeviceName,
                    lastActiveAt: new Date(),
                    createdAt: new Date(),
               });
          }

          // 2. Enforce NO concurrent usage on the same device
          // Generate a unique sessionId for this login session
          const newSessionId = crypto.randomUUID();

          // Store the active session ID in Redis for authenticate middleware to check
          const activeSessionIdKey = `active_session_id:${user.id}:${finalDeviceId}`;
          await redisClient.set(activeSessionIdKey, newSessionId, {
               EX: 7 * 24 * 60 * 60, // 7 days (matching refresh token TTL)
          });

          // ensure jwt secrets are configured
          if (!securityConfig.jwtSecret || !securityConfig.refreshTokenSecret) {
               throw new Error(
                    'JWT secrets are not confirgured in the applications'
               );
          }

          // generate access and refresh token
          const access_token = jwt.sign(
               {
                    id: user.id,
                    role: user.role,
                    email: user.email,
                    sessionId: newSessionId,
                    deviceId: finalDeviceId,
               },
               securityConfig.jwtSecret,
               { expiresIn: securityConfig.accessTokenExpiresIn as any }
          );

          const refresh_token = jwt.sign(
               {
                    id: user.id,
               },
               securityConfig.refreshTokenSecret,
               { expiresIn: securityConfig.refreshTokenExpiresIn as any }
          );

          const redis_key = `active_session:${user.id}:${device_type}`;
          // register the new session in redis
          await redisClient.sAdd(redis_key, refresh_token);

          const refreshTokenTTL = 7 * 24 * 60 * 60;
          await redisClient.expire(redis_key, refreshTokenTTL);

          // omit the password, createdAt and updatedAt from the return user object
          const {
               password: _,
               createdAt: __,
               updatedAt: ___,
               ...user_without_password
          } = user;

          return {
               user: user_without_password,
               access_token,
               refresh_token,
          };
     },

     async get_me(userId: string) {
          const user = await auth_repository.find_user_by_id(userId);

          if (!user) {
               throw new Error('User not found');
          }

          let institution = null;
          if (user.institution_id) {
               const [inst] = await db
                    .select()
                    .from(institutions)
                    .where(eq(institutions.id, user.institution_id))
                    .limit(1);
               institution = inst || null;
          }

          const {
               password: _,
               createdAt: __,
               updatedAt: ___,
               ...user_without_password
          } = user;

          return {
               ...user_without_password,
               institution,
          };
     },

     async refresh_token(
          old_access_token: string,
          refresh_token: string,
          device_type: 'laptop' | 'mobile' | 'tablet'
     ) {
          if (!securityConfig.jwtSecret || !securityConfig.refreshTokenSecret) {
               throw new Error(
                    'JWT secrets are not confirgured in the applications'
               );
          }

          const decoded_access_token = jwt.verify(
               old_access_token,
               securityConfig.jwtSecret,
               { ignoreExpiration: true }
          ) as jwt.JwtPayload;

          const decoded_refresh_token = jwt.verify(
               refresh_token,
               securityConfig.refreshTokenSecret
          ) as jwt.JwtPayload;

          if (!decoded_access_token.id || !decoded_refresh_token.id) {
               throw new Error('Invalid token payload');
          }

          if (decoded_access_token.id !== decoded_refresh_token.id) {
               throw new Error('Token user mismatch');
          }

          const user = await auth_repository.find_user_by_id(
               decoded_refresh_token.id
          );

          if (!user) {
               throw new Error('User not found');
          }

          // check if this is the active session
          const deviceId = decoded_access_token.deviceId || 'unknown_device';
          const activeSessionId = await redisClient.get(
               `active_session_id:${user.id}:${deviceId}`
          );
          if (
               !activeSessionId ||
               decoded_access_token.sessionId !== activeSessionId
          ) {
               throw new Error(
                    'Session is invalid or logged in from another device'
               );
          }

          const redis_key = `active_session:${user.id}:${device_type}`;
          const is_active_session = await redisClient.sIsMember(
               redis_key,
               refresh_token
          );

          if (!is_active_session) {
               throw new Error('Refresh token session is invalid');
          }
          const access_token = jwt.sign(
               {
                    id: user.id,
                    role: user.role,
                    email: user.email,
                    sessionId: decoded_access_token.sessionId,
                    deviceId: deviceId,
               },
               securityConfig.jwtSecret,
               { expiresIn: securityConfig.accessTokenExpiresIn as any }
          );

          const new_refresh_token = jwt.sign(
               {
                    id: user.id,
               },
               securityConfig.refreshTokenSecret,
               { expiresIn: securityConfig.refreshTokenExpiresIn as any }
          );

          await redisClient.sRem(redis_key, refresh_token);
          await redisClient.sAdd(redis_key, new_refresh_token);

          const refreshTokenTTL = 7 * 24 * 60 * 60;
          await redisClient.expire(redis_key, refreshTokenTTL);

          return {
               access_token,
               refresh_token: new_refresh_token,
          };
     },
     async logout_user(
          userId: string,
          device_type: string,
          refresh_token: string,
          deviceId?: string
     ) {
          const redis_key = `active_session:${userId}:${device_type}`;

          await redisClient.sRem(redis_key, refresh_token);
          if (deviceId) {
               await redisClient.del(`active_session_id:${userId}:${deviceId}`);
          } else {
               // Fallback: clear sessions for all registered devices
               const devices = await db
                    .select()
                    .from(user_devices)
                    .where(eq(user_devices.userId, userId));
               for (const d of devices) {
                    await redisClient.del(
                         `active_session_id:${userId}:${d.deviceId}`
                    );
               }
          }
          return { message: 'Logged out successfully!' };
     },

     async send_institution_otp(email: string) {
          const existing_user = await db
               .select()
               .from(users)
               .where(eq(users.email, email))
               .limit(1);

          if (
               existing_user.length > 0 &&
               existing_user[0].role !== 'INSTITUTION_ADMIN'
          ) {
               throw new Error(
                    'Email is already registered as a standard user account'
               );
          }

          const otp = otp_generation();
          const redis_key = `otp:institution:${email}`;
          await redisClient.set(redis_key, otp, { EX: 300 });

          await send_otp_mail(email, otp);

          const isRegistered = existing_user.length > 0;
          return {
               message: 'OTP sent successfully to your institutional email',
               isRegistered,
          };
     },
     async login_institution(data: {
          email: string;
          otp: string;
          institution_name?: string;
          location?: string;
          device_type: 'laptop' | 'mobile' | 'tablet';
          deviceId?: string;
          deviceName?: string;
     }) {
          const {
               email,
               otp,
               institution_name,
               location,
               device_type,
               deviceId,
               deviceName,
          } = data;

          const redis_key_otp = `otp:institution:${email}`;
          const cached_otp = await redisClient.get(redis_key_otp);

          if (!cached_otp) {
               throw new Error(
                    'OTP has expired or does not exist. Please request a new one'
               );
          }

          if (cached_otp !== otp) {
               throw new Error('Invalid OTP. Please try again.');
          }

          await redisClient.del(redis_key_otp);

          let user = await auth_repository.find_user_by_email(email);
          let institutionId = user?.institution_id;

          if (!user) {
               if (!institution_name || !location) {
                    throw new Error(
                         'Institution name and location are required for new registrations.'
                    );
               }

               const userId = crypto.randomUUID();
               institutionId = crypto.randomUUID();

               const placeholder_password = crypto
                    .randomBytes(16)
                    .toString('hex');
               const hashed_password = await bcrypt.hash(
                    placeholder_password,
                    10
               );
               const username =
                    email.split('@')[0] +
                    '_' +
                    Math.floor(Math.random() * 1000);

               user = await auth_repository.create_user({
                    id: userId,
                    username,
                    email,
                    password: hashed_password,
                    role: 'INSTITUTION_ADMIN',
               });

               await db.insert(institutions).values({
                    id: institutionId,
                    name: institution_name,
                    location,
                    admin_id: userId,
                    tier: 'NONE',
               });

               await db
                    .update(users)
                    .set({ institution_id: institutionId })
                    .where(eq(users.id, userId));

               user.institution_id = institutionId;
          } else {
               if (user.role !== 'INSTITUTION_ADMIN') {
                    throw new Error(
                         'Access denied. Account is not registered as an institution.'
                    );
               }

               if (!institutionId) {
                    institutionId = crypto.randomUUID();
                    await db.insert(institutions).values({
                         id: institutionId,
                         name: institution_name || 'My Institution',
                         location: location || 'Global',
                         admin_id: user.id,
                         tier: 'NONE',
                    });
                    await db
                         .update(users)
                         .set({ institution_id: institutionId })
                         .where(eq(users.id, user.id));
                    user.institution_id = institutionId;
               }
          }

          const [institution] = await db
               .select()
               .from(institutions)
               .where(eq(institutions.id, institutionId))
               .limit(1);
          const finalDeviceId = deviceId || 'unknown_device';
          const finalDeviceName = deviceName || `Unknown ${device_type}`;

          // 1. Manage user_devices table
          const userDevices = await db
               .select()
               .from(user_devices)
               .where(eq(user_devices.userId, user.id))
               .orderBy(asc(user_devices.lastActiveAt));

          const existingDevice = userDevices.find(
               (d) => d.deviceId === finalDeviceId
          );

          if (existingDevice) {
               // Update last active time for the existing device
               await db
                    .update(user_devices)
                    .set({ lastActiveAt: new Date() })
                    .where(eq(user_devices.id, existingDevice.id));
          } else {
               // If it's a new device, check if user already has 3 devices registered
               if (userDevices.length >= 3) {
                    // Option B: Automatically delete the oldest device
                    const oldestDevice = userDevices[0];
                    await db
                         .delete(user_devices)
                         .where(eq(user_devices.id, oldestDevice.id));

                    // Invalidate the session on the de-registered device
                    await redisClient.del(
                         `active_session_id:${user.id}:${oldestDevice.deviceId}`
                    );
               }

               // Register the new device
               await db.insert(user_devices).values({
                    id: crypto.randomUUID(),
                    userId: user.id,
                    deviceId: finalDeviceId,
                    deviceName: finalDeviceName,
                    lastActiveAt: new Date(),
                    createdAt: new Date(),
               });
          }

          // 2. Enforce NO concurrent usage on the same device
          // Generate a unique sessionId for this login session
          const newSessionId = crypto.randomUUID();

          // Store the active session ID in Redis for authenticate middleware to check
          const activeSessionIdKey = `active_session_id:${user.id}:${finalDeviceId}`;
          await redisClient.set(activeSessionIdKey, newSessionId, {
               EX: 7 * 24 * 60 * 60, // 7 days (matching refresh token TTL)
          });

          if (!securityConfig.jwtSecret || !securityConfig.refreshTokenSecret) {
               throw new Error(
                    'JWT secrets are not configured in the application'
               );
          }

          const access_token = jwt.sign(
               {
                    id: user.id,
                    role: user.role,
                    email: user.email,
                    institution_id: institutionId,
                    sessionId: newSessionId,
                    deviceId: finalDeviceId,
               },
               securityConfig.jwtSecret,
               { expiresIn: securityConfig.accessTokenExpiresIn as any }
          );

          const refresh_token = jwt.sign(
               { id: user.id },
               securityConfig.refreshTokenSecret,
               { expiresIn: securityConfig.refreshTokenExpiresIn as any }
          );

          const active_session_key = `active_session:${user.id}:${device_type}`;
          await redisClient.sAdd(active_session_key, refresh_token);
          await redisClient.expire(active_session_key, 7 * 24 * 60 * 60);

          const {
               password: _,
               createdAt: __,
               updatedAt: ___,
               ...user_without_password
          } = user;

          return {
               user: {
                    ...user_without_password,
                    institution,
               },
               access_token,
               refresh_token,
          };
     },

     async get_admins() {
          const results = await db
               .select({
                    id: users.id,
                    username: users.username,
                    email: users.email,
                    createdAt: users.createdAt,
               })
               .from(users)
               .where(eq(users.role, 'ADMIN'));
          return results;
     },

     async add_admin(data: {
          username: string;
          email: string;
          password?: string;
     }) {
          const { username, email, password } = data;

          const existing_user = await db
               .select()
               .from(users)
               .where(or(eq(users.email, email), eq(users.username, username)))
               .limit(1);

          if (existing_user.length > 0) {
               const duplicate_field =
                    existing_user[0].email === email ? 'Email' : 'Username';
               throw new Error(`${duplicate_field} is already taken`);
          }

          const adminPassword =
               password || crypto.randomBytes(8).toString('hex');
          const hashedPassword = await bcrypt.hash(adminPassword, 10);

          const createdAdmin = await auth_repository.create_user({
               id: crypto.randomUUID(),
               username,
               email,
               password: hashedPassword,
               role: 'ADMIN',
          });

          const { password: _, ...adminWithoutPassword } = createdAdmin;
          return adminWithoutPassword;
     },

     async remove_admin(adminId: string) {
          const [admin] = await db
               .select()
               .from(users)
               .where(and(eq(users.id, adminId), eq(users.role, 'ADMIN')))
               .limit(1);

          if (!admin) {
               throw new Error('Admin not found.');
          }

          await db.delete(users).where(eq(users.id, adminId));
          return { message: 'Admin removed successfully.' };
     },

     async get_managers() {
          const results = await db
               .select({
                    id: users.id,
                    username: users.username,
                    email: users.email,
                    createdAt: users.createdAt,
               })
               .from(users)
               .where(eq(users.role, 'MANAGER'));
          return results;
     },

     async add_manager(data: {
          username: string;
          email: string;
          password?: string;
     }) {
          const { username, email, password } = data;

          const existing_user = await db
               .select()
               .from(users)
               .where(or(eq(users.email, email), eq(users.username, username)))
               .limit(1);

          if (existing_user.length > 0) {
               const duplicate_field =
                    existing_user[0].email === email ? 'Email' : 'Username';
               throw new Error(`${duplicate_field} is already taken`);
          }

          const managerPassword =
               password || crypto.randomBytes(8).toString('hex');
          const hashedPassword = await bcrypt.hash(managerPassword, 10);

          const createdManager = await auth_repository.create_user({
               id: crypto.randomUUID(),
               username,
               email,
               password: hashedPassword,
               role: 'MANAGER',
          });

          const { password: _, ...managerWithoutPassword } = createdManager;
          return managerWithoutPassword;
     },

     async remove_manager(managerId: string) {
          const [manager] = await db
               .select()
               .from(users)
               .where(and(eq(users.id, managerId), eq(users.role, 'MANAGER')))
               .limit(1);

          if (!manager) {
               throw new Error('Manager not found.');
          }

          await db.delete(users).where(eq(users.id, managerId));
          return { message: 'Manager removed successfully.' };
     },

     async forgot_password(email: string) {
          if (!email) {
               throw new Error('Email address is required.');
          }

          const user = await auth_repository.find_user_by_email(email.toLowerCase().trim());
          if (!user) {
               throw new Error('No account found with this email address.');
          }

          // Strictly restrict password reset to normal readers (role === 'USER')
          if (user.role !== 'USER') {
               throw new Error(
                    'Password reset is only available for standard reader accounts. Admin and institutional accounts must contact their administrator.'
               );
          }

          // Generate a secure 64-char hex token
          const token = crypto.randomBytes(32).toString('hex');
          const redis_key = `reset_token:${token}`;

          // Store in Redis with 30 minutes (1800s) TTL (matching template text)
          await redisClient.set(redis_key, user.id, { EX: 1800 });

          const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
          const resetLink = `${clientUrl}/reset-password?token=${token}`;

          // Send password reset email using the exact template from OAKBRI~1.HTM.html
          await send_password_reset_mail(user.email, user.username, resetLink);

          return { message: 'A password reset link has been sent to your email address.' };
     },

     async reset_password(token: string, new_password: string) {
          if (!token) {
               throw new Error('Reset token is required.');
          }
          if (!new_password || new_password.length < 6) {
               throw new Error('Password must be at least 6 characters long.');
          }

          const redis_key = `reset_token:${token}`;
          const userId = await redisClient.get(redis_key);

          if (!userId) {
               throw new Error('Password reset link is invalid or has expired. Please request a new one.');
          }

          const user = await auth_repository.find_user_by_id(userId);
          if (!user) {
               throw new Error('User account not found.');
          }

          if (user.role !== 'USER') {
               throw new Error('Password reset is only available for standard reader accounts.');
          }

          const hashed_password = await bcrypt.hash(new_password, 10);

          await db
               .update(users)
               .set({ password: hashed_password, updatedAt: new Date() })
               .where(eq(users.id, userId));

          // Delete the reset token from Redis to prevent reuse
          await redisClient.del(redis_key);

          // Clear active user session keys to require fresh login
          const devices = await db
               .select()
               .from(user_devices)
               .where(eq(user_devices.userId, userId));
          for (const d of devices) {
               await redisClient.del(`active_session_id:${userId}:${d.deviceId}`);
          }

          return { message: 'Your password has been reset successfully. You can now log in with your new password.' };
     },

     async update_profile(
          userId: string,
          data: {
               username?: string;
               email?: string;
               password?: string;
               billing_address_line1?: string;
               billing_address_line2?: string;
               billing_city?: string;
               billing_state?: string;
               billing_postal_code?: string;
               billing_country?: string;
          }
     ) {
          const updateData: Partial<NewUser> = {};

          if (data.username) {
               updateData.username = data.username;
          }

          if (data.email) {
               const existingUser = await auth_repository.find_user_by_email(data.email);
               if (existingUser && existingUser.id !== userId) {
                    throw new Error('Email is already in use by another account');
               }
               updateData.email = data.email;
          }

          if (data.password) {
               if (data.password.length < 6) {
                    throw new Error('Password must be at least 6 characters');
               }
               updateData.password = await bcrypt.hash(data.password, 10);
          }

          if (data.billing_address_line1 !== undefined) {
               updateData.billing_address_line1 = data.billing_address_line1;
          }
          if (data.billing_address_line2 !== undefined) {
               updateData.billing_address_line2 = data.billing_address_line2;
          }
          if (data.billing_city !== undefined) {
               updateData.billing_city = data.billing_city;
          }
          if (data.billing_state !== undefined) {
               updateData.billing_state = data.billing_state;
          }
          if (data.billing_postal_code !== undefined) {
               updateData.billing_postal_code = data.billing_postal_code;
          }
          if (data.billing_country !== undefined) {
               updateData.billing_country = data.billing_country;
          }

          if (Object.keys(updateData).length === 0) {
               throw new Error('No fields to update');
          }

          const updatedUser = await auth_repository.update_user(userId, updateData);
          if (!updatedUser) {
               throw new Error('User not found');
          }

          const { password: _, ...userWithoutPassword } = updatedUser;
          return userWithoutPassword;
     },
};
