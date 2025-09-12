# FROM node:20-alpine

# WORKDIR /app

# # Copy package files and install dependencies
# COPY package*.json ./
# COPY tsconfig*.json ./
# RUN npm install

# # Copy all source files
# COPY src/ ./src/

# # Expose port
# EXPOSE 3000

# # Set NODE_ENV to production
# ENV NODE_ENV=production

# # Use ts-node with transpile-only
# CMD ["npx", "ts-node", "--transpile-only", "src/server.ts"]
FROM node:20-alpine
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./

# Install ALL dependencies (including devDependencies for ts-node)
RUN npm ci --include=dev

# Copy source code
COPY src ./src

# Set production environment
ENV NODE_ENV=production

# Don't hardcode port - Railway will set PORT env variable
# EXPOSE is just documentation, Railway ignores it

# Start with ts-node
CMD ["npx", "ts-node", "--transpile-only", "src/server.ts"]
