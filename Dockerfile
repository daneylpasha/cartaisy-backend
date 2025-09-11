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

COPY package*.json ./
COPY tsconfig*.json ./
RUN npm ci        # ts-node devDep ho to bhi install ho jayega (NODE_ENV abhi set nahi)

COPY src ./src
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "-r", "ts-node/register/transpile-only", "src/server.ts"]
