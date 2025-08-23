# Multi-stage build for optimal Railway deployment
FROM node:18-slim as builder

# Install system dependencies needed for node-gyp
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./

# Install yarn 1.x (compatible with lockfile)
RUN npm install -g yarn@1.22.19

# Install dependencies
RUN yarn install --frozen-lockfile --network-timeout 600000

# Copy source and config files
COPY src/ ./src/
COPY tsconfig.json ./
COPY tsconfig.dev.json ./

# Build application
RUN yarn build

# Production stage
FROM node:18-slim as production

# Set working directory
WORKDIR /app

# Install yarn
RUN npm install -g yarn@1.22.19

# Copy package files
COPY package.json yarn.lock ./

# Install only production dependencies
RUN yarn install --production --frozen-lockfile --network-timeout 600000

# Copy built application
COPY --from=builder /app/dist ./dist

# Create non-root user
RUN groupadd -r nodejs && useradd -r -g nodejs nodejs
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); });" || exit 1

# Start application (tsc-alias resolves paths at build time)
CMD ["node", "dist/server.js"]