# Railway-optimized Dockerfile using standard Node image
FROM node:18

# Set working directory
WORKDIR /app

# Install yarn 3.5.1 to match package.json packageManager (force to overwrite existing)
RUN npm install -g yarn@3.5.1 --force

# Copy package files first for layer caching
COPY package.json yarn.lock ./

# Install all dependencies with yarn
RUN yarn install --frozen-lockfile

# Copy all necessary config files explicitly  
COPY tsconfig.json ./
COPY tsconfig.dev.json ./
COPY tsc-alias.config.json ./
COPY railway.json ./

# Copy source code
COPY src/ ./src/

# Build the application (before cleaning dependencies)
RUN yarn build

# Verify build output exists
RUN ls -la dist/

# Clean up dev dependencies to reduce image size (tsconfig-paths is now a prod dependency)
RUN yarn install --frozen-lockfile --production && yarn cache clean

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); });" || exit 1

# Start with node directly to avoid yarn overhead
CMD ["node", "-r", "tsconfig-paths/register", "dist/server.js"]