#!/bin/sh
set -e

echo "==> Baselining initial migration (if DB was previously set up with db push)..."
# Mark the initial migration as already applied.
# Safe to run even if already recorded — '|| true' prevents failure on re-deploys.
pnpm prisma migrate resolve --applied "20260322132611_init" 2>/dev/null || true

echo "==> Clearing any previously failed migrations..."
# If a migration was previously attempted and failed (e.g. duplicate key from db push),
# mark it as rolled-back so migrate deploy can re-apply it with the corrected SQL.
pnpm prisma migrate resolve --rolled-back "20260411_add_email_logs_unique_gmail_message_id" 2>/dev/null || true
pnpm prisma migrate resolve --rolled-back "20260413142258_fcm_tokens" 2>/dev/null || true

echo "==> Applying pending migrations..."
pnpm prisma migrate deploy

echo "==> Starting application..."
exec node dist/src/main
