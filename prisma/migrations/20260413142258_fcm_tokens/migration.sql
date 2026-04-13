-- CreateTable
CREATE TABLE `fcm_tokens` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `token` VARCHAR(500) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `fcm_tokens_token_key`(`token`),
    INDEX `fcm_tokens_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `transactions_user_id_transacted_at_idx` ON `transactions`(`user_id`, `transacted_at`);

-- CreateIndex
CREATE INDEX `transactions_user_id_category_id_idx` ON `transactions`(`user_id`, `category_id`);

-- AddForeignKey
ALTER TABLE `fcm_tokens` ADD CONSTRAINT `fcm_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER TABLE `categories` RENAME INDEX `categories_user_id_fkey` TO `categories_user_id_idx`;

-- RenameIndex
ALTER TABLE `refresh_tokens` RENAME INDEX `refresh_tokens_user_id_fkey` TO `refresh_tokens_user_id_idx`;
