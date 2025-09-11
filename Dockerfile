FROM node:20-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
COPY tsconfig*.json ./
RUN npm install

# Copy all source files (include all config files)
COPY . .

# Expose port
EXPOSE 3000

# Set NODE_ENV to production
ENV NODE_ENV=production

# Use ts-node with transpile-only for faster startup
CMD ["npx", "ts-node", "--transpile-only", "-r", "tsconfig-paths/register", "src/server.ts"]