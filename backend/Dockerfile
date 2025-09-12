# syntax=docker/dockerfile:1
FROM node:20-alpine AS base

ENV NODE_ENV=production
WORKDIR /app

# Install dependencies (only production)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source
COPY server.js ./

# Expose backend port
EXPOSE 3001

# Start the server
CMD ["node", "server.js"]

