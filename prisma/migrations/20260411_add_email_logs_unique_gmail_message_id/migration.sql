-- Add missing UNIQUE index on email_logs.gmail_message_id
-- This index was declared in schema.prisma (@unique) but was not generated
-- in the initial migration, causing deduplication queries to fail silently.
-- IF NOT EXISTS makes this idempotent — safe for DBs that were set up via db push
-- (which would have already created the index from the @unique annotation).
CREATE UNIQUE INDEX IF NOT EXISTS `email_logs_gmail_message_id_key` ON `email_logs`(`gmail_message_id`);

-- Add index for better query performance on email_logs lookups by user
CREATE INDEX IF NOT EXISTS `email_logs_user_id_idx` ON `email_logs`(`user_id`);
