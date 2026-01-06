# Production Dockerfile - TypeScript with ts-node
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY yarn.lock ./
COPY tsconfig*.json ./

# Install ALL dependencies (needed for ts-node)
RUN npm ci --include=dev

# Copy source code
COPY src ./src
COPY public ./public

# Generate tsoa routes and spec
RUN npx tsoa spec || echo "⚠️ Spec generation failed" && \
    npx tsoa routes || echo "⚠️ Routes generation failed"

# Set environment
ENV NODE_ENV=production
ENV TS_NODE_TRANSPILE_ONLY=true
ENV TS_NODE_PROJECT=./tsconfig.json

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start TypeScript with SWC runtime compiler (fast, no type checking)
CMD ["node", "--require", "@swc-node/register", "-r", "tsconfig-paths/register", "src/server.ts"]
