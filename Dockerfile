# syntax=docker/dockerfile:1.6
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./

# Disable telemetry and unnecessary outputs
ENV npm_config_fund=false \
    npm_config_audit=false

# BuildKit cache for faster rebuilds
RUN npm ci

# Development stage
FROM node:20-alpine AS dev
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .


# Prisma
RUN npx prisma generate

EXPOSE 8000

CMD ["npm", "run", "dev"]