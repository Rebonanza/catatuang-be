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

# Generate Prisma Client (uses dummy URL for build-time validation)
RUN DATABASE_URL="mysql://dummy:dummy@localhost:3306/dummy" pnpm prisma generate

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

# Copy built files and prisma from base stage
COPY --from=base /app/dist ./dist
COPY --from=base /app/prisma ./prisma
COPY --from=base /app/prisma.config.ts ./

# Generate Prisma Client in the production node_modules
RUN DATABASE_URL="mysql://dummy:dummy@localhost:3306/dummy" pnpm prisma generate

# Expose the default port (Koyeb overrides PORT at runtime)
EXPOSE 3000

# Start the application with schema synchronization
CMD ["sh", "-c", "DATABASE_URL=$DATABASE_URL pnpm prisma db push && node dist/src/main"]
