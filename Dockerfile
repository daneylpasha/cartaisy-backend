FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies
RUN npm install

# Copy source code
COPY src/ ./src/

# Expose port
EXPOSE 3000

# Use ts-node to run TypeScript directly (skip compilation)
CMD ["npx", "ts-node", "-r", "tsconfig-paths/register", "src/server.ts"]