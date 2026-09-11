import { Request, Response } from 'express';
import { mailing_service, AUDIENCE_TYPES, type Audience } from './mailing.service';
import { verifyUnsubscribeToken } from '../../utils/mail.service';

const parseAudience = (raw: any): Audience => {
     if (!raw || !AUDIENCE_TYPES.includes(raw.type)) {
          throw new Error('Choose who should receive this email');
     }
     return {
          type: raw.type,
          institution_id: raw.institution_id ? String(raw.institution_id) : undefined,
          user_ids: Array.isArray(raw.user_ids) ? raw.user_ids.map(String) : undefined,
     };
};

const page = (title: string, body: string) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Oakbridge</title></head>
<body style="margin:0;background:#F5F7FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#002B5C;">
<div style="max-width:480px;margin:64px auto;padding:0 16px;">
<div style="background:#fff;border:1px solid #E5E7EB;padding:32px;">
<div style="font-family:Georgia,serif;font-size:20px;margin-bottom:20px;">Oakbridge <span style="color:#F59E0B;">Publishing</span></div>
${body}
</div></div></body></html>`;

const readUnsubscribeParams = (req: Request) => ({
     userId: String(req.query.u || ''),
     token: String(req.query.t || ''),
});

export const mailing_controller = {
     async get_overview(req: Request, res: Response): Promise<any> {
          try {
               const data = await mailing_service.get_overview();
               return res.status(200).json({ success: true, data });
          } catch (error: any) {
               return res.status(500).json({ success: false, message: error.message || 'Failed to load email settings' });
          }
     },

     async search_users(req: Request, res: Response): Promise<any> {
          try {
               const data = await mailing_service.search_users(String(req.query.search || ''), Number(req.query.limit) || 50);
               return res.status(200).json({ success: true, data });
          } catch (error: any) {
               return res.status(500).json({ success: false, message: error.message || 'Failed to search users' });
          }
     },

     async match_emails(req: Request, res: Response): Promise<any> {
          try {
               const emails: string[] = Array.isArray(req.body?.emails) ? req.body.emails : [];
               const data = await mailing_service.match_emails(emails);
               return res.status(200).json({ success: true, data });
          } catch (error: any) {
               return res.status(500).json({ success: false, message: error.message || 'Failed to match emails' });
          }
     },

     async preview_audience(req: Request, res: Response): Promise<any> {
          try {
               const data = await mailing_service.preview_audience(parseAudience(req.body?.audience));
               return res.status(200).json({ success: true, data });
          } catch (error: any) {
               return res.status(400).json({ success: false, message: error.message || 'Failed to preview audience' });
          }
     },

     async announce_books(req: Request, res: Response): Promise<any> {
          try {
               const data = await mailing_service.announce_books({
                    book_ids: Array.isArray(req.body?.book_ids) ? req.body.book_ids.map(String) : [],
                    audience: parseAudience(req.body?.audience),
                    subject: typeof req.body?.subject === 'string' ? req.body.subject : undefined,
                    message: typeof req.body?.message === 'string' ? req.body.message : undefined,
               });
               return res.status(200).json({ success: true, data });
          } catch (error: any) {
               return res.status(400).json({ success: false, message: error.message || 'Failed to send announcement' });
          }
     },

     async update_automatic(req: Request, res: Response): Promise<any> {
          try {
               const data = await mailing_service.update_automatic({
                    inactivity_reminders: req.body?.inactivity_reminders,
                    cart_reminders: req.body?.cart_reminders,
               });
               return res.status(200).json({ success: true, data });
          } catch (error: any) {
               return res.status(500).json({ success: false, message: error.message || 'Failed to update email settings' });
          }
     },

     /** GET from the email link: confirm first (link scanners must not unsubscribe people). */
     async unsubscribe_page(req: Request, res: Response): Promise<any> {
          const { userId, token } = readUnsubscribeParams(req);
          if (!verifyUnsubscribeToken(userId, token)) {
               return res.status(400).send(page('Invalid link', '<p>This unsubscribe link is invalid or incomplete.</p>'));
          }
          const action = `?u=${encodeURIComponent(userId)}&t=${encodeURIComponent(token)}`;
          return res.status(200).send(
               page(
                    'Unsubscribe',
                    `<h1 style="font-family:Georgia,serif;font-weight:normal;font-size:22px;margin:0 0 12px;">Unsubscribe from Oakbridge emails?</h1>
<p style="color:#4B5563;font-size:15px;line-height:1.6;">You'll stop getting new-book announcements and reading or cart reminders. You'll still get essential emails such as login codes, password resets and purchase receipts.</p>
<form method="post" action="${action}" style="margin-top:20px;">
<button type="submit" style="background:#002B5C;color:#fff;border:0;padding:12px 24px;font-size:14px;font-weight:600;cursor:pointer;">Unsubscribe</button>
</form>`
               )
          );
     },

     /** POST from the confirm button, or one-click from Gmail/Outlook. */
     async unsubscribe(req: Request, res: Response): Promise<any> {
          const { userId, token } = readUnsubscribeParams(req);
          if (!verifyUnsubscribeToken(userId, token)) {
               return res.status(400).send(page('Invalid link', '<p>This unsubscribe link is invalid or incomplete.</p>'));
          }
          try {
               await mailing_service.unsubscribe(userId);
               return res.status(200).send(
                    page(
                         'Unsubscribed',
                         `<h1 style="font-family:Georgia,serif;font-weight:normal;font-size:22px;margin:0 0 12px;">You're unsubscribed</h1>
<p style="color:#4B5563;font-size:15px;line-height:1.6;">You won't receive marketing emails from Oakbridge anymore. You can turn them back on any time from your profile page.</p>`
                    )
               );
          } catch (error: any) {
               return res.status(500).send(page('Something went wrong', '<p>We could not update your preferences. Please try again later.</p>'));
          }
     },
};
