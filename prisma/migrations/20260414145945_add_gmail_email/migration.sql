/*
  Warnings:

  - Added the required column `email` to the `gmail_tokens` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `gmail_tokens` ADD COLUMN `email` VARCHAR(255) NOT NULL;

-- CreateIndex
CREATE INDEX `gmail_tokens_email_idx` ON `gmail_tokens`(`email`);

-- CreateIndex
CREATE INDEX `transactions_user_id_transacted_at_idx` ON `transactions`(`user_id`, `transacted_at`);

-- CreateIndex
CREATE INDEX `transactions_user_id_category_id_idx` ON `transactions`(`user_id`, `category_id`);

-- RenameIndex
ALTER TABLE `categories` RENAME INDEX `categories_user_id_fkey` TO `categories_user_id_idx`;

-- RenameIndex
ALTER TABLE `refresh_tokens` RENAME INDEX `refresh_tokens_user_id_fkey` TO `refresh_tokens_user_id_idx`;
