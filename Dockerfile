# Use Node.js 20 slim as the base image
FROM node:20-slim AS base

# Install pnpm and openssl (required for Prisma and Node.js)
RUN npm install -g pnpm && \
    apt-get update -y && \
    apt-get install -y openssl && \
    rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies (including dev deps for build)
RUN pnpm install --frozen-lockfile

# Copy source code and other required files
COPY . .

# Generate Prisma Client
RUN pnpm prisma generate

# Build the application
RUN pnpm build

# Final target image
FROM node:20-slim

# Install pnpm and openssl for the runtime environment
RUN npm install -g pnpm && \
    apt-get update -y && \
    apt-get install -y openssl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy from build stage
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/dist ./dist
COPY --from=base /app/package.json ./package.json
COPY --from=base /app/prisma ./prisma

# Expose the application port
EXPOSE 3000

# Set environment variable for port
ENV PORT=3000

# Start the application
CMD ["pnpm", "start:prod"]
