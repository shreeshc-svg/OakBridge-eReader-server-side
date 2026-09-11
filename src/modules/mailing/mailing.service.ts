import { and, count, desc, eq, ilike, inArray, or, type SQL } from 'drizzle-orm';
import { db } from '../../db/db';
import { books, institutions, users } from '../../db/schemas';
import { sendNewBooksAnnouncementMail } from '../../utils/mail.service';
import { get_long_lived_presigned_url, get_presigned_url } from '../../utils/s3';
import { settings_service } from '../settings/settings.service';
import {
     EMAIL_SETTING_KEYS,
     isEmailSettingEnabled,
} from '../../utils/email_settings';

// ── Audiences ────────────────────────────────────────────────────────────────

export const AUDIENCE_TYPES = [
     'all_readers',
     'individual_readers',
     'institution_users',
     'institution',
     'selected',
] as const;
export type AudienceType = (typeof AUDIENCE_TYPES)[number];

export interface Audience {
     type: AudienceType;
     institution_id?: string;
     user_ids?: string[];
}

/** Same group the old automatic "new book" email went to. */
const READER_ROLES = ['USER', 'INSTITUTION_MEMBER'] as const;
const INSTITUTION_ROLES = ['INSTITUTION_ADMIN', 'INSTITUTION_MEMBER'] as const;

export const MAX_BOOKS_PER_EMAIL = 50;
const MAX_SELECTED_USERS = 5000;
const SEND_BATCH_SIZE = 25;

const audienceCondition = (audience: Audience): SQL => {
     switch (audience?.type) {
          case 'all_readers':
               return inArray(users.role, [...READER_ROLES]);
          case 'individual_readers':
               return eq(users.role, 'USER');
          case 'institution_users':
               return inArray(users.role, [...INSTITUTION_ROLES]);
          case 'institution': {
               if (!audience.institution_id) {
                    throw new Error('Choose an institution');
               }
               return and(
                    eq(users.institution_id, audience.institution_id),
                    inArray(users.role, [...INSTITUTION_ROLES])
               ) as SQL;
          }
          case 'selected': {
               const ids = [...new Set((audience.user_ids || []).filter(Boolean))];
               if (ids.length === 0) {
                    throw new Error('Select at least one user');
               }
               if (ids.length > MAX_SELECTED_USERS) {
                    throw new Error(`You can select up to ${MAX_SELECTED_USERS} users`);
               }
               return inArray(users.id, ids);
          }
          default:
               throw new Error('Unknown audience');
     }
};

/** People who will receive the email (unsubscribed users are always left out). */
const resolveAudience = async (audience: Audience) => {
     const condition = audienceCondition(audience);

     const recipients = await db
          .select({ id: users.id, email: users.email, username: users.username })
          .from(users)
          .where(and(condition, eq(users.marketing_emails, true)));

     const [{ value: opted_out }] = await db
          .select({ value: count() })
          .from(users)
          .where(and(condition, eq(users.marketing_emails, false)));

     return { recipients, opted_out: Number(opted_out) };
};

// ── Covers ───────────────────────────────────────────────────────────────────

const isExternalUrl = (url: string) =>
     /^https?:\/\//i.test(url) && !/\.amazonaws\.com/i.test(new URL(url).hostname);

/** Short-lived link for showing covers in the admin page. */
const coverForAdmin = async (url: string) => {
     if (!url) return '';
     try {
          return isExternalUrl(url) ? url : await get_presigned_url(url);
     } catch {
          return url;
     }
};

/** Cover link that keeps working in an inbox for up to 7 days. */
const coverForEmail = async (url: string) => {
     if (!url) return '';
     try {
          return isExternalUrl(url) ? url : await get_long_lived_presigned_url(url);
     } catch {
          return url;
     }
};

// ── Service ──────────────────────────────────────────────────────────────────

export const mailing_service = {
     /** Everything the admin 'Email Updates' page needs in one call. */
     async get_overview() {
          const bookRows = await db
               .select({
                    id: books.id,
                    title: books.title,
                    author: books.author,
                    isbn: books.isbn,
                    price: books.price,
                    cover_image_url: books.cover_image_url,
                    created_at: books.createdAt,
                    announced_at: books.announced_at,
               })
               .from(books)
               .orderBy(desc(books.createdAt));

          const bookList = await Promise.all(
               bookRows.map(async (b) => ({
                    ...b,
                    cover_image_url: await coverForAdmin(b.cover_image_url),
               }))
          );

          const countFor = async (condition: SQL) => {
               const [{ value }] = await db
                    .select({ value: count() })
                    .from(users)
                    .where(and(condition, eq(users.marketing_emails, true)));
               return Number(value);
          };

          const [all_readers, individual_readers, institution_users] = await Promise.all([
               countFor(inArray(users.role, [...READER_ROLES])),
               countFor(eq(users.role, 'USER')),
               countFor(inArray(users.role, [...INSTITUTION_ROLES])),
          ]);

          const [{ value: unsubscribed }] = await db
               .select({ value: count() })
               .from(users)
               .where(eq(users.marketing_emails, false));

          const institutionRows = await db
               .select({
                    id: institutions.id,
                    name: institutions.name,
                    members: count(users.id),
               })
               .from(institutions)
               .leftJoin(
                    users,
                    and(
                         eq(users.institution_id, institutions.id),
                         inArray(users.role, [...INSTITUTION_ROLES]),
                         eq(users.marketing_emails, true)
                    )
               )
               .groupBy(institutions.id, institutions.name)
               .orderBy(institutions.name);

          const [inactivity_reminders, cart_reminders] = await Promise.all([
               isEmailSettingEnabled(EMAIL_SETTING_KEYS.inactivity_reminders),
               isEmailSettingEnabled(EMAIL_SETTING_KEYS.cart_reminders),
          ]);

          return {
               books: bookList,
               audience_counts: {
                    all_readers,
                    individual_readers,
                    institution_users,
                    unsubscribed: Number(unsubscribed),
               },
               institutions: institutionRows.map((i) => ({
                    ...i,
                    members: Number(i.members),
               })),
               automatic: { inactivity_reminders, cart_reminders },
               max_books_per_email: MAX_BOOKS_PER_EMAIL,
          };
     },

     /** Search users to hand-pick recipients. */
     async search_users(search: string, limit = 50) {
          const term = search.trim();
          const where = term
               ? or(ilike(users.email, `%${term}%`), ilike(users.username, `%${term}%`))
               : undefined;

          return db
               .select({
                    id: users.id,
                    username: users.username,
                    email: users.email,
                    role: users.role,
                    marketing_emails: users.marketing_emails,
               })
               .from(users)
               .where(where)
               .orderBy(users.email)
               .limit(Math.min(Math.max(limit, 1), 100));
     },

     /** Match a pasted list of emails to registered users. */
     async match_emails(emails: string[]) {
          const cleaned = [
               ...new Set(
                    emails
                         .map((e) => String(e || '').trim().toLowerCase())
                         .filter((e) => e.includes('@'))
               ),
          ].slice(0, MAX_SELECTED_USERS);

          if (cleaned.length === 0) return { matched: [], not_found: [] };

          const allUsers = await db
               .select({
                    id: users.id,
                    username: users.username,
                    email: users.email,
                    role: users.role,
                    marketing_emails: users.marketing_emails,
               })
               .from(users);

          const byEmail = new Map(allUsers.map((u) => [u.email.toLowerCase(), u]));
          const matched = cleaned
               .map((e) => byEmail.get(e))
               .filter((u): u is NonNullable<typeof u> => !!u);
          const not_found = cleaned.filter((e) => !byEmail.has(e));
          return { matched, not_found };
     },

     async preview_audience(audience: Audience) {
          const { recipients, opted_out } = await resolveAudience(audience);
          return {
               recipients: recipients.length,
               unsubscribed_skipped: opted_out,
               sample: recipients.slice(0, 5).map((r) => r.email),
          };
     },

     /**
      * Send ONE email listing the chosen books to everyone in the audience.
      * Returns straight away; emails go out in the background in small batches.
      */
     async announce_books(input: {
          book_ids: string[];
          audience: Audience;
          subject?: string;
          message?: string;
     }) {
          const bookIds = [...new Set((input.book_ids || []).filter(Boolean))];
          if (bookIds.length === 0) {
               throw new Error('Select at least one book');
          }
          if (bookIds.length > MAX_BOOKS_PER_EMAIL) {
               throw new Error(`Select up to ${MAX_BOOKS_PER_EMAIL} books per email`);
          }

          const bookRows = await db
               .select({
                    id: books.id,
                    title: books.title,
                    author: books.author,
                    description: books.description,
                    cover_image_url: books.cover_image_url,
                    price: books.price,
               })
               .from(books)
               .where(inArray(books.id, bookIds))
               .orderBy(desc(books.createdAt));

          if (bookRows.length === 0) {
               throw new Error('Selected books were not found');
          }

          const { recipients, opted_out } = await resolveAudience(input.audience);
          if (recipients.length === 0) {
               throw new Error('Nobody to send to in this audience');
          }

          const emailBooks = await Promise.all(
               bookRows.map(async (b) => ({
                    id: b.id,
                    title: b.title,
                    author: b.author || 'Oakbridge',
                    description: b.description || '',
                    cover_url: await coverForEmail(b.cover_image_url),
                    price: b.price,
               }))
          );

          const subject = (input.subject || '').slice(0, 200);
          const message = (input.message || '').slice(0, 2000);

          await db
               .update(books)
               .set({ announced_at: new Date() })
               .where(inArray(books.id, bookRows.map((b) => b.id)));

          // Send in the background so the admin page doesn't wait
          (async () => {
               let sent = 0;
               let failed = 0;
               for (let i = 0; i < recipients.length; i += SEND_BATCH_SIZE) {
                    const chunk = recipients.slice(i, i + SEND_BATCH_SIZE);
                    await Promise.all(
                         chunk.map((r) =>
                              sendNewBooksAnnouncementMail(r, emailBooks, { subject, message })
                                   .then(() => {
                                        sent++;
                                   })
                                   .catch((err) => {
                                        failed++;
                                        console.error(`[MAIL] Announcement failed for ${r.email}:`, err);
                                   })
                         )
                    );
               }
               console.log(
                    `[MAIL] Book announcement finished: ${sent} sent, ${failed} failed, ${emailBooks.length} book(s).`
               );
          })();

          return {
               recipients: recipients.length,
               unsubscribed_skipped: opted_out,
               books: bookRows.length,
          };
     },

     async update_automatic(settings: {
          inactivity_reminders?: boolean;
          cart_reminders?: boolean;
     }) {
          if (typeof settings.inactivity_reminders === 'boolean') {
               await settings_service.update_setting(
                    EMAIL_SETTING_KEYS.inactivity_reminders,
                    settings.inactivity_reminders ? 'true' : 'false'
               );
          }
          if (typeof settings.cart_reminders === 'boolean') {
               await settings_service.update_setting(
                    EMAIL_SETTING_KEYS.cart_reminders,
                    settings.cart_reminders ? 'true' : 'false'
               );
          }
          const [inactivity_reminders, cart_reminders] = await Promise.all([
               isEmailSettingEnabled(EMAIL_SETTING_KEYS.inactivity_reminders),
               isEmailSettingEnabled(EMAIL_SETTING_KEYS.cart_reminders),
          ]);
          return { inactivity_reminders, cart_reminders };
     },

     /** Called from the unsubscribe link in emails. */
     async unsubscribe(userId: string) {
          const [updated] = await db
               .update(users)
               .set({ marketing_emails: false, updatedAt: new Date() })
               .where(eq(users.id, userId))
               .returning({ id: users.id });
          return !!updated;
     },
};
