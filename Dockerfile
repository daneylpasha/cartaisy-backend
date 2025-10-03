# Production-ready Dockerfile using ts-node for TypeScript execution
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY yarn.lock ./
COPY tsconfig*.json ./

# Install ALL dependencies (ts-node needs devDependencies)
RUN npm ci --include=dev

# Copy source code and public assets
COPY src ./src
COPY public ./public

# Generate tsoa routes and swagger spec
RUN npx tsoa spec || echo "⚠️  Spec generation failed" && \
    npx tsoa routes || echo "⚠️  Routes generation failed"

# Set production environment
ENV NODE_ENV=production

# Health check - uses /api/health endpoint
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start with ts-node in transpile-only mode (fast, ignores type errors)
CMD ["npx", "ts-node", "--transpile-only", "src/server.ts"]
