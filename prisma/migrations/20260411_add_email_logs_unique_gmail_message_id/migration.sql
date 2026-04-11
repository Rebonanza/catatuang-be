-- Add missing UNIQUE index on email_logs.gmail_message_id
-- This index was declared in schema.prisma (@unique) but was not generated
-- in the initial migration, causing deduplication queries to fail silently.
CREATE UNIQUE INDEX `email_logs_gmail_message_id_key` ON `email_logs`(`gmail_message_id`);

-- Add missing indexes for better query performance on email_logs
CREATE INDEX `email_logs_user_id_idx` ON `email_logs`(`user_id`);
