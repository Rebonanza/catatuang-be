# Use Node.js 20 slim as the base image
FROM node:20-slim AS base

# Enable corepack (ships with Node 20) and install openssl for Prisma
RUN corepack enable && corepack prepare pnpm@latest --activate && \
    apt-get update -y && \
    apt-get install -y openssl && \
    rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies (including dev deps for build)
RUN pnpm install --no-frozen-lockfile

# Copy source code and other required files
COPY . .

# Generate Prisma Client
RUN pnpm prisma generate

# Build the application
RUN pnpm build

# Final target image
FROM node:20-slim

# Enable corepack and install openssl for the runtime environment
RUN corepack enable && corepack prepare pnpm@latest --activate && \
    apt-get update -y && \
    apt-get install -y openssl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install ONLY production dependencies
RUN pnpm install --prod --no-frozen-lockfile

# Copy built files and prisma from base stage
COPY --from=base /app/dist ./dist
COPY --from=base /app/prisma ./prisma

# Generate Prisma Client in the production node_modules
RUN pnpm prisma generate

# Expose the default port (Koyeb overrides PORT at runtime)
EXPOSE 3000

# Start the application with automatic migrations
CMD ["sh", "-c", "pnpm prisma migrate deploy && node dist/src/main"]
