# syntax=docker/dockerfile:1
FROM node:20-alpine AS base

ENV NODE_ENV=production
WORKDIR /app

# Install dependencies (only production)
COPY package*.json ./
# Install production dependencies. Prefer npm ci when lockfile is present,
# otherwise fall back to npm install (useful on environments where the lockfile
# hasn't been copied alongside package.json).
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev --no-audit --no-fund; \
    else \
      echo "[backend] package-lock.json not found; running npm install" && \
      npm install --omit=dev --no-audit --no-fund --legacy-peer-deps; \
    fi

# Copy application source
COPY server.js ./

# Expose backend port
EXPOSE 3002

# Start the server
CMD ["node", "server.js"]
