FROM node:20-alpine

WORKDIR /app

# Copy package.json and install dependencies
COPY package.json .
RUN npm install --only=production

# Copy the server file
COPY server.js .

# Expose port
EXPOSE 3000

# Start server directly
CMD ["node", "server.js"]