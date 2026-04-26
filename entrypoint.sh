#!/bin/sh
set -e

echo "==> Applying pending migrations..."
pnpm prisma migrate deploy

echo "==> Starting application..."
exec node dist/src/main