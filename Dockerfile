# Production-ready multi-stage Docker build for Railway
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files for dependency installation
COPY package.json yarn.lock ./

# Install yarn globally with specific version
RUN npm install -g yarn@1.22.19 --force

# Install all dependencies (including dev dependencies for build)
RUN yarn install --production=false

# Copy ALL source code and config files
COPY . .

# No build needed - using plain JavaScript server
RUN echo "Using production JavaScript server - no TypeScript build required"

# Production stage
FROM node:20-alpine AS production

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./

# Install yarn globally
RUN npm install -g yarn@1.22.19 --force

# Install only production dependencies
RUN yarn install --production=true

# Copy production server from builder stage  
COPY --from=builder /app/server.js ./

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S cartaisy -u 1001

# Change ownership of app directory
RUN chown -R cartaisy:nodejs /app

# Switch to non-root user
USER cartaisy

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD node -e "require('http').get('http://0.0.0.0:' + (process.env.PORT || 3000) + '/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); });" || exit 1

# Start application - use railway-server.js for Railway deployment
CMD ["node", "railway-server.js"]