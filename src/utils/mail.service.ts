import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { mailConfig, securityConfig } from '../config/app.config';
import { generateInvoicePDF } from './pdf.service';

const transporter = nodemailer.createTransport({
     host: mailConfig.smtp_host,
     port: mailConfig.port,
     secure: mailConfig.secure,
     auth: {
          user: mailConfig.auth.smtp_email,
          pass: mailConfig.auth.smtp_password,
     },
});

// ── Marketing email helpers (unsubscribe) ───────────────────────────────────

const getUnsubscribeSecret = (): string => {
     const secret = process.env.UNSUBSCRIBE_SECRET || securityConfig.jwtSecret;
     if (!secret) {
          throw new Error('UNSUBSCRIBE_SECRET / ACCESS_TOKEN_SECRET is not configured');
     }
     return secret;
};

/** Token that lets a user unsubscribe from a link without logging in. */
export const makeUnsubscribeToken = (userId: string): string =>
     crypto
          .createHmac('sha256', getUnsubscribeSecret())
          .update(`unsubscribe:${userId}`)
          .digest('hex');

export const verifyUnsubscribeToken = (userId: string, token: string): boolean => {
     if (!userId || !token) return false;
     const expected = Buffer.from(makeUnsubscribeToken(userId));
     const given = Buffer.from(String(token));
     return expected.length === given.length && crypto.timingSafeEqual(expected, given);
};

/** Public URL of the backend API as seen from an email client. */
const apiPublicUrl = (): string =>
     process.env.API_PUBLIC_URL ||
     `${process.env.CLIENT_URL || 'http://localhost:3000'}/api`;

export const getUnsubscribeUrl = (userId: string): string =>
     `${apiPublicUrl()}/mailing/unsubscribe?u=${encodeURIComponent(userId)}&t=${makeUnsubscribeToken(userId)}`;

/** Headers so Gmail/Outlook show their own "Unsubscribe" button (RFC 8058). */
const unsubscribeHeaders = (userId?: string): Record<string, string> | undefined =>
     userId
          ? {
                 'List-Unsubscribe': `<${getUnsubscribeUrl(userId)}>`,
                 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            }
          : undefined;

const unsubscribeFooterHtml = (userId?: string): string =>
     userId
          ? `<p style="margin:10px 0 0;font-size:12px;color:#6B7280;">Don't want these emails? <a href="${getUnsubscribeUrl(userId)}" style="color:#6B7280;text-decoration:underline;">Unsubscribe</a>.</p>`
          : '';

const escapeHtml = (value: string): string =>
     String(value ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');

export const send_otp_mail = async (email: string, otp: string) => {
     await transporter.sendMail({
          from: process.env.SMTP_EMAIL || mailConfig.auth.smtp_email,
          to: email,
          subject: 'Email Verification OTP',
          html: `
               <!DOCTYPE html><html lang="en"><head><meta charset="utf-8"></head>
               <body style="margin:0;padding:0;background-color:#F5F7FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#002B5C;">
               <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F5F7FA;padding:40px 16px;">
                 <tr><td align="center">
                   <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;background-color:#FFFFFF;border:1px solid #E5E7EB;">
                     <tr><td style="background-color:#002B5C;padding:28px 36px;color:#FFFFFF;">
                       <div style="font-family:Georgia,serif;font-size:22px;">Oakbridge <span style="color:#F59E0B;">Publishing</span></div>
                       <div style="font-family:monospace;text-transform:uppercase;letter-spacing:2px;font-size:11px;margin-top:6px;color:rgba(255,255,255,0.6);">Verify your email</div>
                     </td></tr>
                     <tr><td style="padding:36px 36px 8px;">
                       <h1 style="margin:0;font-family:Georgia,serif;font-weight:normal;font-size:24px;color:#002B5C;">Hi Reader,</h1>
                       <p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:#4B5563;">Use the code below to verify your Oakbridge account. It expires in 5 minutes.</p>
                     </td></tr>
                     <tr><td style="padding:8px 36px 36px;">
                       <div style="font-family:monospace;font-size:40px;letter-spacing:12px;font-weight:700;color:#002B5C;background:#F5F7FA;border:1px solid #E5E7EB;text-align:center;padding:20px 0;">${otp}</div>
                       <p style="margin:16px 0 0;font-size:12px;color:#4B5563;">If you didn't create an account, you can safely ignore this email.</p>
                     </td></tr>
                   </table>
                 </td></tr>
               </table>
               </body></html>
          `,
     });
};

export const send_password_reset_mail = async (
     email: string,
     username: string,
     resetLink: string
) => {
     await transporter.sendMail({
          from: process.env.SMTP_EMAIL || mailConfig.auth.smtp_email,
          to: email,
          subject: 'Password reset request — Oakbridge',
          html: `
               <!DOCTYPE html><html lang="en"><head><meta charset="utf-8"></head>
               <body style="margin:0;padding:0;background-color:#F5F7FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#002B5C;">
               <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F5F7FA;padding:40px 16px;">
                 <tr><td align="center">
                   <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;background-color:#FFFFFF;border:1px solid #E5E7EB;">
                     <tr><td style="background-color:#002B5C;padding:28px 36px;color:#FFFFFF;">
                       <div style="font-family:Georgia,serif;font-size:22px;">Oakbridge <span style="color:#F59E0B;">Publishing</span></div>
                       <div style="font-family:monospace;text-transform:uppercase;letter-spacing:2px;font-size:11px;margin-top:6px;color:rgba(255,255,255,0.6);">Password reset</div>
                     </td></tr>
                     <tr><td style="padding:36px 36px 8px;">
                       <h1 style="margin:0;font-family:Georgia,serif;font-weight:normal;font-size:24px;color:#002B5C;">Hi ${username || 'Reader'},</h1>
                       <p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:#4B5563;">We received a request to reset your Oakbridge password. Click below to choose a new one. This link expires in 30 minutes.</p>
                     </td></tr>
                     <tr><td style="padding:20px 36px 8px;">
                       <a href="${resetLink}" style="display:inline-block;background-color:#002B5C;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;padding:14px 28px;">Reset password</a>
                     </td></tr>
                     <tr><td style="padding:24px 36px 36px;">
                       <p style="margin:0;font-size:12px;color:#4B5563;">If you didn't request this, you can safely ignore this email — your password won't change. If the button doesn't work, paste this link into your browser:<br><span style="color:#002B5C;word-break:break-all;">${resetLink}</span></p>
                     </td></tr>
                   </table>
                 </td></tr>
               </table>
               </body></html>
          `,
     });
};

export const sendWelcomeMail = async (email: string, username: string) => {
     const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
     await transporter.sendMail({
          from: process.env.SMTP_EMAIL || mailConfig.auth.smtp_email,
          to: email,
          subject: 'Welcome to Oakbridge!',
          html: `
               <!DOCTYPE html><html lang="en"><head><meta charset="utf-8"></head>
               <body style="margin:0;padding:0;background-color:#F5F7FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#002B5C;">
               <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F5F7FA;padding:40px 16px;">
                 <tr><td align="center">
                   <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;background-color:#FFFFFF;border:1px solid #E5E7EB;">
                     <tr><td style="background-color:#002B5C;padding:28px 36px;color:#FFFFFF;">
                       <div style="font-family:Georgia,serif;font-size:22px;">Oakbridge <span style="color:#F59E0B;">Publishing</span></div>
                       <div style="font-family:monospace;text-transform:uppercase;letter-spacing:2px;font-size:11px;margin-top:6px;color:rgba(255,255,255,0.6);">Welcome</div>
                     </td></tr>
                     <tr><td style="padding:36px 36px 8px;">
                       <h1 style="margin:0;font-family:Georgia,serif;font-weight:normal;font-size:26px;color:#002B5C;">Welcome, ${username}.</h1>
                       <p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#4B5563;">Your Oakbridge account is ready — welcome to a library built for the intellectually curious. Here's what you can do from here:</p>
                       <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 4px;">
                         <tr><td style="color:#F59E0B;font-size:16px;vertical-align:top;padding:0 10px 8px 0;line-height:1.5;">&#10003;</td><td style="font-size:15px;line-height:1.5;color:#4B5563;padding-bottom:8px;"><strong style="color:#002B5C;">Order</strong> your favourite law, tax, academic &amp; reference titles</td></tr>
                         <tr><td style="color:#F59E0B;font-size:16px;vertical-align:top;padding:0 10px 8px 0;line-height:1.5;">&#10003;</td><td style="font-size:15px;line-height:1.5;color:#4B5563;padding-bottom:8px;"><strong style="color:#002B5C;">Rate &amp; review</strong> the books you read — and guide fellow readers</td></tr>
                         <tr><td style="color:#F59E0B;font-size:16px;vertical-align:top;padding:0 10px 0 0;line-height:1.5;">&#10003;</td><td style="font-size:15px;line-height:1.5;color:#4B5563;"><strong style="color:#002B5C;">Track &amp; reorder</strong> — follow every order and restock your shelf in one click</td></tr>
                       </table>
                       <p style="margin:18px 0 0;font-size:15px;line-height:1.6;color:#4B5563;">Your next great read is a click away.</p>
                     </td></tr>
                     <tr><td style="padding:20px 36px 8px;">
                       <a href="${clientUrl}/store" style="display:inline-block;background-color:#002B5C;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;padding:14px 28px;">Browse the bookstore</a>
                     </td></tr>
                     <tr><td style="padding:24px 36px 36px;">
                       <p style="margin:0;font-size:12px;color:#4B5563;">Questions? Reach us at <a href="mailto:info@oakbridge.in" style="color:#002B5C;">info@oakbridge.in</a>. Oakbridge Publishing, B3 Tower, Spaze i-Tech Park, Sector 49, Gurugram, Haryana 122018.</p>
                     </td></tr>
                   </table>
                 </td></tr>
               </table>
               </body></html>
          `
     });
};

export const sendInactivityReminderMail = async (
     email: string,
     username: string,
     bookTitle: string,
     userId?: string
) => {
     await transporter.sendMail({
          from: process.env.SMTP_EMAIL || mailConfig.auth.smtp_email,
          to: email,
          headers: unsubscribeHeaders(userId),
          subject: `Pick up where you left off: ${bookTitle}`,
          html: `
               <!DOCTYPE html><html lang="en"><head><meta charset="utf-8"></head>
               <body style="margin:0;padding:0;background-color:#F5F7FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#002B5C;">
               <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F5F7FA;padding:40px 16px;">
                 <tr><td align="center">
                   <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background-color:#FFFFFF;border:1px solid #E5E7EB;">
                     <tr><td style="background-color:#002B5C;padding:28px 36px;color:#FFFFFF;">
                       <div style="font-family:Georgia,serif;font-size:22px;">Oakbridge <span style="color:#F59E0B;">Publishing</span></div>
                       <div style="font-family:monospace;text-transform:uppercase;letter-spacing:2px;font-size:11px;margin-top:6px;color:rgba(255,255,255,0.6);">Resume Reading</div>
                     </td></tr>
                     <tr><td style="padding:36px 36px 8px;">
                       <h1 style="margin:0;font-family:Georgia,serif;font-weight:normal;font-size:24px;color:#002B5C;">Hi ${username || 'Reader'},</h1>
                       <p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:#4B5563;">It has been over 6 months since you last read <strong style="color:#002B5C;">"${bookTitle}"</strong> from your Virtual Bookshelf.</p>
                       <p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:#4B5563;">Reading regularly helps retain knowledge and build strong habits. Why not take a few minutes today to dive back in?</p>
                     </td></tr>
                     <tr><td style="padding:20px 36px 8px;">
                       <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/dashboard" style="display:inline-block;background-color:#002B5C;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;padding:14px 28px;">Resume reading</a>
                     </td></tr>
                     <tr><td style="padding:24px 36px 36px;">
                       <p style="margin:0;font-size:12px;color:#4B5563;">You received this email because "${bookTitle}" is on your Oakbridge Reader bookshelf. Oakbridge Publishing, B3 Tower, Spaze i-Tech Park, Sector 49, Gurugram, Haryana 122018.</p>
                       ${unsubscribeFooterHtml(userId)}
                     </td></tr>
                   </table>
                 </td></tr>
               </table>
               </body></html>
          `,
     });
};

export const sendBookAdvertisementMail = async (
     email: string,
     username: string,
     book: {
          id: string;
          title: string;
          author: string;
          description: string;
          cover_url: string;
     }
) => {
     const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
     await transporter.sendMail({
          from: process.env.SMTP_EMAIL || mailConfig.auth.smtp_email,
          to: email,
          subject: `New Release: "${book.title}" by ${book.author}`,
          html: `
               <!DOCTYPE html><html lang="en"><head><meta charset="utf-8"></head>
               <body style="margin:0;padding:0;background-color:#F5F7FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#002B5C;">
               <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F5F7FA;padding:40px 16px;">
                 <tr><td align="center">
                   <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background-color:#FFFFFF;border:1px solid #E5E7EB;">
                     <tr><td style="background-color:#002B5C;padding:28px 36px;color:#FFFFFF;">
                       <div style="font-family:Georgia,serif;font-size:22px;">Oakbridge <span style="color:#F59E0B;">Publishing</span></div>
                       <div style="font-family:monospace;text-transform:uppercase;letter-spacing:2px;font-size:11px;margin-top:6px;color:rgba(255,255,255,0.6);">New Release</div>
                     </td></tr>
                     <tr><td style="padding:36px 36px 8px;">
                       <h1 style="margin:0;font-family:Georgia,serif;font-weight:normal;font-size:24px;color:#002B5C;">Hi ${username || 'Reader'},</h1>
                       <p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:#4B5563;">We are excited to announce that a new book has just been published on Oakbridge!</p>
                     </td></tr>
                     <tr><td style="padding:0 36px 8px;">
                       <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F8FAFC;border:1px solid #E5E7EB;padding:16px;border-radius:8px;">
                         <tr>
                           <td style="width:100px;vertical-align:top;padding-right:16px;">
                             <img src="${book.cover_url}" alt="${book.title} Cover" width="100" style="width:100px;height:auto;border-radius:6px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);display:block;" />
                           </td>
                           <td style="vertical-align:top;">
                             <h3 style="margin:0 0 4px;color:#002B5C;font-family:Georgia,serif;font-weight:normal;font-size:18px;">${book.title}</h3>
                             <p style="margin:0 0 12px;color:#6B7280;font-size:14px;">By ${book.author}</p>
                             <p style="margin:0;color:#4B5563;font-size:14px;line-height:1.5;">
                               ${book.description.length > 150 ? book.description.substring(0, 150) + '...' : book.description}
                             </p>
                           </td>
                         </tr>
                       </table>
                     </td></tr>
                     <tr><td style="padding:20px 36px 8px;">
                       <a href="${clientUrl}/book/${book.id}" style="display:inline-block;background-color:#002B5C;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;padding:14px 28px;">Start reading now</a>
                     </td></tr>
                     <tr><td style="padding:24px 36px 36px;">
                       <p style="margin:0;font-size:12px;color:#4B5563;">You received this email because you are a registered reader on Oakbridge. Oakbridge Publishing, B3 Tower, Spaze i-Tech Park, Sector 49, Gurugram, Haryana 122018.</p>
                     </td></tr>
                   </table>
                 </td></tr>
               </table>
               </body></html>
          `,
     });
};

export const sendFreeBookAdvertisementMail = async (
     email: string,
     username: string,
     book: {
          id: string;
          title: string;
          author: string;
          description: string;
          cover_url: string;
     }
) => {
     const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
     await transporter.sendMail({
          from: process.env.SMTP_EMAIL || mailConfig.auth.smtp_email,
          to: email,
          subject: `🎁 Free Read Alert: "${book.title}" by ${book.author}`,
          html: `
               <!DOCTYPE html><html lang="en"><head><meta charset="utf-8"></head>
               <body style="margin:0;padding:0;background-color:#F5F7FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#002B5C;">
               <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F5F7FA;padding:40px 16px;">
                 <tr><td align="center">
                   <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background-color:#FFFFFF;border:1px solid #E5E7EB;">
                     <tr><td style="background-color:#002B5C;padding:28px 36px;color:#FFFFFF;">
                       <div style="font-family:Georgia,serif;font-size:22px;">Oakbridge <span style="color:#F59E0B;">Publishing</span></div>
                       <div style="font-family:monospace;text-transform:uppercase;letter-spacing:2px;font-size:11px;margin-top:6px;color:rgba(255,255,255,0.6);">Free Book Alert</div>
                     </td></tr>
                     <tr><td style="padding:36px 36px 8px;">
                       <h1 style="margin:0;font-family:Georgia,serif;font-weight:normal;font-size:24px;color:#002B5C;">Hi ${username || 'Reader'},</h1>
                       <p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:#4B5563;">Good news! A new book has just been published on Oakbridge and it is available to read <strong style="color:#002B5C;">completely FREE</strong>!</p>
                     </td></tr>
                     <tr><td style="padding:0 36px 8px;">
                       <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#FFFCF9;border:1px solid #FFD8C2;padding:16px;border-radius:8px;">
                         <tr>
                           <td style="width:100px;vertical-align:top;padding-right:16px;">
                             <img src="${book.cover_url}" alt="${book.title} Cover" width="100" style="width:100px;height:auto;border-radius:6px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);display:block;" />
                           </td>
                           <td style="vertical-align:top;">
                             <h3 style="margin:0 0 4px;color:#002B5C;font-family:Georgia,serif;font-weight:normal;font-size:18px;">${book.title}</h3>
                             <p style="margin:0 0 12px;color:#6B7280;font-size:14px;">By ${book.author}</p>
                             <p style="margin:0;color:#4B5563;font-size:14px;line-height:1.5;">
                               ${book.description.length > 150 ? book.description.substring(0, 150) + '...' : book.description}
                             </p>
                           </td>
                         </tr>
                       </table>
                     </td></tr>
                     <tr><td style="padding:20px 36px 8px;">
                       <a href="${clientUrl}/book/${book.id}" style="display:inline-block;background-color:#002B5C;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;padding:14px 28px;">Read for free</a>
                     </td></tr>
                     <tr><td style="padding:24px 36px 36px;">
                       <p style="margin:0;font-size:12px;color:#4B5563;">You received this email because you are a registered reader on Oakbridge. Oakbridge Publishing, B3 Tower, Spaze i-Tech Park, Sector 49, Gurugram, Haryana 122018.</p>
                     </td></tr>
                   </table>
                 </td></tr>
               </table>
               </body></html>
          `,
     });
};



export const sendAbandonedCartMail = async (
     email: string,
     username: string,
     items: { title: string; price: number }[],
     type: '12h' | '1w' | '1m',
     userId?: string
) => {
     const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

     let subject = '';
     let heading = '';
     let bodyText = '';

     if (type === '12h') {
          subject = '🛒 Complete your purchase - Your next chapter awaits!';
          heading = `Your next chapter awaits, ${username}.`;
          bodyText = `The book below is still waiting in your cart. Popular titles move fast and prices can change without notice — claim it before someone else does.`;
     } else if (type === '1w') {
          subject = '⏳ Don’t let this one slip away!';
          heading = `Don’t let this one slip away, ${username}.`;
          bodyText = `It’s been a week, and sought-after titles like this don’t stay on the shelf for long. Complete your order now — before it sells out and you miss the chapter.`;
     } else {
          // '1m'
          subject = '⚠️ Last call for items in your cart!';
          heading = `Last call — before it’s gone, ${username}.`;
          bodyText = `Final reminder: your book is still in your cart, but stock is limited and the month is closing out. Secure it now, or risk missing out for good.`;
     }

     const itemsHtml = items.map(item => {
          const formattedPrice = (item.price / 100).toLocaleString('en-IN', {
               minimumFractionDigits: 0,
               maximumFractionDigits: 0
          });
          return `
            <tr>
              <td style="padding:12px 0;width:76px;"></td>
              <td style="padding:12px 0;color:#002B5C;font-size:14px;">
                ${item.title}
                <div style="color:#4B5563;font-size:12px;margin-top:2px;">Qty 1</div>
              </td>
              <td style="padding:12px 0;text-align:right;color:#002B5C;font-size:14px;white-space:nowrap;">
                ₹${formattedPrice}
              </td>
            </tr>
          `;
     }).join('');

     await transporter.sendMail({
          from: process.env.SMTP_EMAIL || mailConfig.auth.smtp_email,
          to: email,
          headers: unsubscribeHeaders(userId),
          subject,
          html: `
               <!DOCTYPE html><html lang="en"><head><meta charset="utf-8"></head>
               <body style="margin:0;padding:0;background-color:#F5F7FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#002B5C;">
               <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F5F7FA;padding:40px 16px;">
                 <tr><td align="center">
                   <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background-color:#FFFFFF;border:1px solid #E5E7EB;">
                     <tr><td style="background-color:#002B5C;padding:28px 36px;color:#FFFFFF;">
                       <div style="font-family:Georgia,serif;font-size:22px;">Oakbridge <span style="color:#F59E0B;">Publishing</span></div>
                       <div style="font-family:monospace;text-transform:uppercase;letter-spacing:2px;font-size:11px;margin-top:6px;color:rgba(255,255,255,0.6);">Your cart</div>
                     </td></tr>
                     <tr><td style="padding:36px 36px 6px;">
                       <h1 style="margin:0;font-family:Georgia,serif;font-weight:normal;font-size:26px;color:#002B5C;">${heading}</h1>
                       <p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:#4B5563;">${bodyText}</p>
                     </td></tr>
                     <tr><td style="padding:16px 36px 0;">
                       <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                         ${itemsHtml}
                       </table>
                     </td></tr>
                     <tr><td style="padding:28px 36px 40px;">
                       <a href="${clientUrl}/cart" style="display:inline-block;background-color:#002B5C;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;padding:14px 30px;">Complete your order</a>
                     </td></tr>
                     <tr><td style="padding:0 36px 36px;">
                       <p style="margin:0;font-size:12px;color:#4B5563;">You received this email because you have books in your Oakbridge cart. Oakbridge Publishing, B3 Tower, Spaze i-Tech Park, Sector 49, Gurugram, Haryana 122018.</p>
                       ${unsubscribeFooterHtml(userId)}
                     </td></tr>
                   </table>
                 </td></tr>
               </table>
               </body></html>
          `,
     });
};

export const sendPurchaseInvoiceMail = async (
     email: string,
     username: string,
     orderId: string,
     paymentId: string,
     date: string,
     amount: number,
     items: { title: string; author?: string; isbn?: string; price: number }[],
     tier?: string,
     shippingAddress?: string,
     billingAddress?: string
) => {
     const totalAmountInr = (amount / 100).toFixed(2);
     const totalPaidVal = Number(totalAmountInr);
     const taxVal = Number((totalPaidVal - (totalPaidVal / 1.18)).toFixed(2));
     const subtotalVal = Number((totalPaidVal - taxVal).toFixed(2));

     const formattedDate = new Date(date).toLocaleDateString('en-IN', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
     });

     let itemsHtml = '';
     if (tier) {
          itemsHtml = `
               <tr>
                   <td style="padding:14px 0;border-bottom:1px solid #E5E7EB;color:#002B5C;font-size:14px;">
                       <strong>Oakbridge ${tier} Membership Subscription</strong>
                       <div style="color:#4B5563;font-size:12px;margin-top:2px;">1-Year Access</div>
                   </td>
                   <td style="padding:14px 0;border-bottom:1px solid #E5E7EB;color:#002B5C;font-size:14px;text-align:right;white-space:nowrap;">
                       ₹${totalAmountInr}
                   </td>
               </tr>
          `;
     } else {
          itemsHtml = items
               .map(
                    (item) => `
               <tr>
                   <td style="padding:14px 0;border-bottom:1px solid #E5E7EB;color:#002B5C;font-size:14px;">
                       ${item.title}
                       <div style="color:#4B5563;font-size:12px;margin-top:2px;">Qty 1</div>
                   </td>
                   <td style="padding:14px 0;border-bottom:1px solid #E5E7EB;color:#002B5C;font-size:14px;text-align:right;white-space:nowrap;">
                       ₹${(item.price / 100).toFixed(2)}
                   </td>
               </tr>
          `
               )
               .join('');
     }

     const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

     // Generate the PDF invoice in memory
     const pdfBuffer = await generateInvoicePDF({
          invoiceNo: `OAK-2026-27-${paymentId.substring(0, 4).toUpperCase()}`,
          date: formattedDate,
          orderNo: orderId,
          paymentRef: paymentId,
          buyerName: username,
          shippingAddress: shippingAddress,
          billingAddress: billingAddress,
          items: items,
          totalAmount: amount,
          tier: tier
     });

     await transporter.sendMail({
          from: process.env.SMTP_EMAIL || mailConfig.auth.smtp_email,
          to: email,
          subject: `Your Oakbridge order — ${orderId}`,
          html: `
               <!DOCTYPE html>
               <html lang="en">
               <head>
               <meta charset="utf-8">
               <title>Your Oakbridge order — ${orderId}</title>
               </head>
               <body style="margin:0;padding:0;background-color:#F5F7FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#002B5C;">
               <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F5F7FA;padding:40px 16px;">
                 <tr><td align="center">
                   <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background-color:#FFFFFF;border:1px solid #E5E7EB;">
                     <!-- Header -->
                     <tr><td style="background-color:#002B5C;padding:32px 36px;color:#FFFFFF;">
                       <div style="font-family:Georgia,serif;font-size:24px;letter-spacing:0.5px;">Oakbridge <span style="color:#F59E0B;">Publishing</span></div>
                       <div style="font-family:monospace;text-transform:uppercase;letter-spacing:2px;font-size:11px;margin-top:6px;color:rgba(255,255,255,0.6);">Order Receipt</div>
                     </td></tr>

                     <!-- Greeting -->
                     <tr><td style="padding:40px 36px 24px;">
                       <h1 style="margin:0;font-family:Georgia,serif;font-weight:normal;font-size:28px;line-height:1.2;color:#002B5C;">
                         Thank you, ${username}.
                       </h1>
                       <p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#4B5563;">
                         Your payment has been received and your order is confirmed. We've send another note the moment it ships.
                       </p>
                     </td></tr>

                     <!-- Order meta -->
                     <tr><td style="padding:0 36px;">
                       <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid #E5E7EB;border-bottom:1px solid #E5E7EB;margin-top:8px;">
                         <tr>
                           <td style="padding:18px 0;width:50%;">
                             <div style="font-family:monospace;text-transform:uppercase;letter-spacing:1.5px;font-size:10px;color:#4B5563;">Order number</div>
                             <div style="margin-top:4px;font-family:monospace;font-size:14px;color:#002B5C;">${orderId}</div>
                           </td>
                           <td style="padding:18px 0;width:50%;text-align:right;">
                             <div style="font-family:monospace;text-transform:uppercase;letter-spacing:1.5px;font-size:10px;color:#4B5563;">Payment ID</div>
                             <div style="margin-top:4px;font-family:monospace;font-size:14px;color:#002B5C;">${paymentId}</div>
                           </td>
                         </tr>
                       </table>
                     </td></tr>

                     <!-- Items -->
                     <tr><td style="padding:24px 36px 0;">
                       <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                         ${itemsHtml}
                       </table>
                     </td></tr>

                     <!-- Totals -->
                     <tr><td style="padding:8px 36px 0;">
                       <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                         <tr><td style="padding:6px 0;color:#4B5563;font-size:13px;">Subtotal</td>
                             <td style="padding:6px 0;text-align:right;color:#002B5C;font-size:13px;">₹${subtotalVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
                         
                         <tr><td style="padding:6px 0;color:#4B5563;font-size:13px;">Shipping</td>
                             <td style="padding:6px 0;text-align:right;color:#002B5C;font-size:13px;">₹0.00</td></tr>
                         <tr><td style="padding:6px 0;color:#4B5563;font-size:13px;">Tax</td>
                             <td style="padding:6px 0;text-align:right;color:#002B5C;font-size:13px;">₹${taxVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
                         <tr><td style="padding:16px 0 4px;border-top:2px solid #002B5C;font-family:Georgia,serif;font-size:18px;color:#002B5C;">Total paid</td>
                             <td style="padding:16px 0 4px;border-top:2px solid #002B5C;text-align:right;font-family:Georgia,serif;font-size:22px;color:#002B5C;">₹${totalPaidVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
                       </table>
                     </td></tr>

                     <!-- Footer -->
                     <tr><td style="padding:40px 36px 36px;">
                       <div style="border-top:1px solid #E5E7EB;padding-top:24px;font-size:12px;line-height:1.6;color:#4B5563;">
                         Questions? Reply to this email or write to us at <a href="mailto:info@oakbridge.in" style="color:#002B5C;">info@oakbridge.in</a>.<br>
                         Oakbridge Publishing Pvt. Ltd. · B3 Tower, Spaze iTech Park, Sector 49, Gurugram, Haryana 122018
                       </div>
                     </td></tr>
                   </table>
                 </td></tr>
               </table>
               </body>
               </html>
          `,
          attachments: [
               {
                    filename: `Invoice_${orderId}.pdf`,
                    content: pdfBuffer,
                    contentType: 'application/pdf'
               }
          ]
     });
};

export const send_contact_notification_mail = async (
     name: string,
     email: string,
     subject: string | undefined,
     message: string
) => {
     const recipient = process.env.CONTACT_FORM_RECIPIENT || 'info@oakbridge.in';
     await transporter.sendMail({
          from: process.env.SMTP_EMAIL || mailConfig.auth.smtp_email,
          to: recipient,
          replyTo: email,
          subject: `[Contact Form] ${subject || 'New Message from ' + name}`,
          html: `
               <!DOCTYPE html><html lang="en"><head><meta charset="utf-8"></head>
               <body style="margin:0;padding:0;background-color:#F5F7FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#002B5C;">
               <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F5F7FA;padding:40px 16px;">
                 <tr><td align="center">
                   <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;background-color:#FFFFFF;border:1px solid #E5E7EB;">
                     <tr><td style="background-color:#002B5C;padding:28px 36px;color:#FFFFFF;">
                       <div style="font-family:Georgia,serif;font-size:22px;">Oakbridge <span style="color:#F59E0B;">Publishing</span></div>
                       <div style="font-family:monospace;text-transform:uppercase;letter-spacing:2px;font-size:11px;margin-top:6px;color:rgba(255,255,255,0.6);">New Contact Form Submission</div>
                     </td></tr>
                     <tr><td style="padding:36px 36px 8px;">
                       <h1 style="margin:0;font-family:Georgia,serif;font-weight:normal;font-size:22px;color:#002B5C;">Inquiry from ${name}</h1>
                       <p style="margin:14px 0 0;font-size:14px;line-height:1.6;color:#4B5563;">You have received a new contact form message on Oakbridge Publishing.</p>
                     </td></tr>
                     <tr><td style="padding:16px 36px;">
                       <div style="background-color:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;padding:20px;">
                         <p style="margin:0 0 10px;font-size:14px;color:#002B5C;"><strong>Sender:</strong> ${name} (&lt;<a href="mailto:${email}" style="color:#002B5C;text-decoration:underline;">${email}</a>&gt;)</p>
                         <p style="margin:0 0 16px;font-size:14px;color:#002B5C;"><strong>Subject:</strong> ${subject || 'General Inquiry'}</p>
                         <hr style="border:none;border-top:1px dashed #CBD5E1;margin:16px 0;" />
                         <p style="margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#64748B;font-weight:600;">Message Content:</p>
                         <div style="font-size:14px;line-height:1.6;color:#334155;white-space:pre-wrap;">${message}</div>
                       </div>
                     </td></tr>
                     <tr><td style="padding:16px 36px 36px;">
                       <p style="margin:0;font-size:12px;color:#64748B;line-height:1.5;">Clicking <strong>Reply</strong> in your email client will send a direct reply to <strong>${email}</strong>.</p>
                     </td></tr>
                   </table>
                 </td></tr>
               </table>
               </body></html>
          `,
     });
};

/**
 * One email announcing one or more books, sent from the admin 'Email Updates' page.
 * Always includes an unsubscribe link.
 */
export const sendNewBooksAnnouncementMail = async (
     recipient: { id: string; email: string; username: string | null },
     books: {
          id: string;
          title: string;
          author: string;
          description: string;
          cover_url: string;
          price: number;
     }[],
     options: { subject?: string; message?: string } = {}
) => {
     const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
     const single = books.length === 1;
     const subject =
          options.subject?.trim() ||
          (single
               ? `New Release: "${books[0].title}" by ${books[0].author}`
               : `${books.length} new books on Oakbridge`);
     const intro = options.message?.trim()
          ? escapeHtml(options.message.trim()).replace(/\n/g, '<br />')
          : single
            ? 'A new book has just been published on Oakbridge.'
            : `${books.length} new books have just been published on Oakbridge.`;

     const booksHtml = books
          .map((book) => {
               const description =
                    book.description.length > 150
                         ? book.description.substring(0, 150) + '...'
                         : book.description;
               const price =
                    book.price > 0
                         ? `₹${(book.price / 100).toLocaleString('en-IN')}`
                         : 'Free';
               return `
                         <tr><td style="padding:0 36px 12px;">
                           <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F8FAFC;border:1px solid #E5E7EB;padding:16px;border-radius:8px;">
                             <tr>
                               <td style="width:90px;vertical-align:top;padding-right:16px;">
                                 <img src="${escapeHtml(book.cover_url)}" alt="${escapeHtml(book.title)} cover" width="90" style="width:90px;height:auto;border-radius:6px;display:block;" />
                               </td>
                               <td style="vertical-align:top;">
                                 <h3 style="margin:0 0 4px;color:#002B5C;font-family:Georgia,serif;font-weight:normal;font-size:17px;">${escapeHtml(book.title)}</h3>
                                 <p style="margin:0 0 8px;color:#6B7280;font-size:13px;">By ${escapeHtml(book.author)} · ${price}</p>
                                 <p style="margin:0 0 10px;color:#4B5563;font-size:13px;line-height:1.5;">${escapeHtml(description)}</p>
                                 <a href="${clientUrl}/book/${book.id}" style="color:#002B5C;font-size:13px;font-weight:600;">View book →</a>
                               </td>
                             </tr>
                           </table>
                         </td></tr>`;
          })
          .join('');

     await transporter.sendMail({
          from: process.env.SMTP_EMAIL || mailConfig.auth.smtp_email,
          to: recipient.email,
          headers: unsubscribeHeaders(recipient.id),
          subject,
          html: `
               <!DOCTYPE html><html lang="en"><head><meta charset="utf-8"></head>
               <body style="margin:0;padding:0;background-color:#F5F7FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#002B5C;">
               <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F5F7FA;padding:40px 16px;">
                 <tr><td align="center">
                   <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background-color:#FFFFFF;border:1px solid #E5E7EB;">
                     <tr><td style="background-color:#002B5C;padding:28px 36px;color:#FFFFFF;">
                       <div style="font-family:Georgia,serif;font-size:22px;">Oakbridge <span style="color:#F59E0B;">Publishing</span></div>
                       <div style="font-family:monospace;text-transform:uppercase;letter-spacing:2px;font-size:11px;margin-top:6px;color:rgba(255,255,255,0.6);">${single ? 'New Release' : 'New Releases'}</div>
                     </td></tr>
                     <tr><td style="padding:36px 36px 20px;">
                       <h1 style="margin:0;font-family:Georgia,serif;font-weight:normal;font-size:24px;color:#002B5C;">Hi ${escapeHtml(recipient.username || 'Reader')},</h1>
                       <p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:#4B5563;">${intro}</p>
                     </td></tr>
                     ${booksHtml}
                     <tr><td style="padding:16px 36px 8px;">
                       <a href="${clientUrl}/" style="display:inline-block;background-color:#002B5C;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;padding:14px 28px;">Browse the bookstore</a>
                     </td></tr>
                     <tr><td style="padding:24px 36px 36px;">
                       <p style="margin:0;font-size:12px;color:#4B5563;">You received this email because you are a registered reader on Oakbridge. Oakbridge Publishing, B3 Tower, Spaze i-Tech Park, Sector 49, Gurugram, Haryana 122018.</p>
                       ${unsubscribeFooterHtml(recipient.id)}
                     </td></tr>
                   </table>
                 </td></tr>
               </table>
               </body></html>
          `,
     });
};
