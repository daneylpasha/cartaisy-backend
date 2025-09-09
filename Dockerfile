FROM node:20-alpine

WORKDIR /app

# Copy only the server file
COPY simple-server.js .

# Expose port
EXPOSE 3000

# Start server directly
CMD ["node", "simple-server.js"]