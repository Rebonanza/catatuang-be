#!/bin/sh
set -e

echo "==> Baselining initial migration (if DB was previously set up with db push)..."
# Mark the initial migration as already applied.
# This is safe to run even if already recorded — the '|| true' prevents failure
# if the migration history already exists.
pnpm prisma migrate resolve --applied "20260322132611_init" 2>/dev/null || true

echo "==> Applying pending migrations..."
pnpm prisma migrate deploy

echo "==> Starting application..."
exec node dist/src/main
