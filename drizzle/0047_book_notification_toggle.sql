-- "New book added" alerts: per-user opt-out
--
-- The global switch lives in the settings table (key
-- 'new_book_notifications_enabled', written by the admin Email Updates page),
-- so nothing is needed for it here. This adds the reader's own setting.
--
-- Safe to run more than once.

ALTER TABLE "users"
     ADD COLUMN IF NOT EXISTS "book_notifications" boolean DEFAULT true NOT NULL;
