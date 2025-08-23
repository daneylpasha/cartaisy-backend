# Railway-optimized Dockerfile using standard Node image
FROM node:18

# Set working directory
WORKDIR /app

# Install yarn globally
RUN npm install -g yarn@1.22.19

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

# Verify files exist and build
RUN ls -la . && yarn build

# Clean up dev dependencies to reduce image size
RUN yarn install --frozen-lockfile --production && yarn cache clean

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); });" || exit 1

# Start with yarn
CMD ["yarn", "start"]