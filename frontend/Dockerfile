# syntax=docker/dockerfile:1
FROM node:20-bullseye-slim AS build
WORKDIR /app

# Install deps
COPY package*.json ./
ENV CI=true \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_PROGRESS=false \
    NPM_CONFIG_LOGLEVEL=warn

# Work around rare npm crash by pinning npm and providing a fallback
RUN npm i -g npm@10.7.0 && \
    (npm ci --no-audit --no-fund || (echo "npm ci failed, falling back to npm install" && rm -rf node_modules package-lock.json && npm install --no-audit --no-fund --legacy-peer-deps))

# Copy source and config
COPY . .

# Build static assets (Vite)
RUN npm run build

FROM nginx:1.27-alpine AS runtime

# Copy custom nginx config for SPA routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
