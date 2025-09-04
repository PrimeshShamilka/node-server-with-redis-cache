# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies separately to leverage layer caching
COPY package*.json ./
RUN npm ci --omit=dev

# Copy app files
COPY server.js ./

# Expose port
EXPOSE 3000

# Env
ENV NODE_ENV=production

# Start
CMD ["npm", "start"]

