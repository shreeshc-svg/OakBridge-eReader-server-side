import rateLimit from 'express-rate-limit';

// UX-safe auth rate limiter (supports shared office/college NAT IPs)
export const authLimiter = rateLimit({
     windowMs: 15 * 60 * 1000, // 15 minutes
     max: 50, // allow up to 50 login/OTP requests per 15 min
     standardHeaders: true,
     legacyHeaders: false,
     message: {
          success: false,
          message: 'Too many authentication attempts. Please try again after 15 minutes.',
     },
});

// UX-safe general API rate limiter (prevents scraping without blocking heavy users)
export const apiLimiter = rateLimit({
     windowMs: 15 * 60 * 1000, // 15 minutes
     max: 2000, // allow up to 2,000 requests per 15 min (safe for shared office IPs)
     standardHeaders: true,
     legacyHeaders: false,
     message: {
          success: false,
          message: 'Too many requests from this IP. Please try again later.',
     },
});
