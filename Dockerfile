FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm install

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN npm run build:simple

# Remove dev dependencies for smaller image
RUN npm prune --production

# Expose port
EXPOSE 3000

# Start the compiled server
CMD ["node", "dist/server.js"]