# Single-stage build - Railway-optimized
FROM node:18

# Set working directory
WORKDIR /app

# Copy package files first for caching
COPY package.json yarn.lock ./

# Install yarn 1.22.19 to match package.json
RUN npm install -g yarn@1.22.19 --force

# Install all dependencies
RUN yarn install --frozen-lockfile

# Copy source and config files
COPY src/ ./src/
COPY tsconfig.json ./
COPY tsconfig.dev.json ./

# Build the application
RUN yarn build

# Verify build output
RUN ls -la dist/

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); });" || exit 1

# Start application directly
CMD ["node", "dist/server.js"]