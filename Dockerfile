# Railway-optimized Dockerfile using Yarn
FROM node:18-alpine

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    dumb-init

# Set working directory
WORKDIR /app

# Enable Corepack and set yarn version
RUN corepack enable
RUN corepack prepare yarn@1.22.19 --activate

# Copy package files first for layer caching
COPY package.json yarn.lock ./

# Install all dependencies with yarn
RUN yarn install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN yarn build

# Clean up dev dependencies to reduce image size
RUN yarn install --frozen-lockfile --production && yarn cache clean

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); });" || exit 1

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start with yarn
CMD ["yarn", "start"]