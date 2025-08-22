# Multi-stage Dockerfile for Cartaisy Backend
# Optimized for production deployment with security best practices

# Stage 1: Dependencies
FROM node:18-alpine AS dependencies

# Install build dependencies
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY yarn.lock* ./
COPY .npmrc* ./

# Install production dependencies
RUN npm ci --only=production

# Stage 2: Build
FROM node:18-alpine AS build

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY yarn.lock* ./
COPY .npmrc* ./

# Install all dependencies (including dev)
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Stage 3: Production
FROM node:18-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy production dependencies from dependencies stage
COPY --from=dependencies --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy built application from build stage
COPY --from=build --chown=nodejs:nodejs /app/dist ./dist
COPY --from=build --chown=nodejs:nodejs /app/package*.json ./
COPY --from=build --chown=nodejs:nodejs /app/.env.template.production ./.env.template

# Create necessary directories with proper permissions
RUN mkdir -p /app/uploads /app/logs /app/temp && \
    chown -R nodejs:nodejs /app/uploads /app/logs /app/temp

# Switch to non-root user
USER nodejs

# Expose application port
EXPOSE 3000

# Health check configuration
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); });" || exit 1

# Set environment to production
ENV NODE_ENV=production

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/server.js"]

# Build arguments for version tracking
ARG BUILD_DATE
ARG VCS_REF
ARG VERSION

# Labels for metadata
LABEL org.label-schema.build-date=$BUILD_DATE \
      org.label-schema.name="Cartaisy Backend" \
      org.label-schema.description="Enterprise E-commerce API Platform" \
      org.label-schema.url="https://cartaisy.com" \
      org.label-schema.vcs-ref=$VCS_REF \
      org.label-schema.vcs-url="https://github.com/your-org/cartaisy-backend" \
      org.label-schema.vendor="Cartaisy" \
      org.label-schema.version=$VERSION \
      org.label-schema.schema-version="1.0"