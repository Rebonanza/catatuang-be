# Use Node.js 20 slim as the base image
FROM node:20-slim AS base

# Enable corepack (ships with Node 20) and install openssl for Prisma
RUN corepack enable && corepack prepare pnpm@latest --activate && \
    apt-get update -y && \
    apt-get install -y openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies (including dev deps for build)
RUN pnpm install --no-frozen-lockfile

# Copy source code and other required files
COPY . .

# Generate Prisma Client — Prisma v7 does NOT need DATABASE_URL for generate
# (URL is managed via prisma.config.ts and only needed at runtime for migrate)
RUN pnpm prisma generate

# Build the application
RUN pnpm build

# Final target image
FROM node:20-slim

# Enable corepack and install openssl for the runtime environment
RUN corepack enable && corepack prepare pnpm@latest --activate && \
    apt-get update -y && \
    apt-get install -y openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install ONLY production dependencies
RUN pnpm install --prod --no-frozen-lockfile

# Copy built files, prisma schemas, config, and entrypoint from base stage
COPY --from=base /app/dist ./dist
COPY --from=base /app/prisma ./prisma
COPY --from=base /app/prisma.config.ts ./
COPY --from=base /app/entrypoint.sh ./entrypoint.sh

# Generate Prisma Client in production node_modules — no DATABASE_URL needed
RUN pnpm prisma generate

# Make entrypoint executable
RUN chmod +x entrypoint.sh

# Expose the default port (Koyeb overrides PORT at runtime)
EXPOSE 3000

# Entrypoint: baselines initial migration (for db push DBs), then applies
# pending migrations, then starts the app. DATABASE_URL injected by Koyeb.
CMD ["sh", "entrypoint.sh"]
