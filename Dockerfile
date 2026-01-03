FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production image
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# ID for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 expressjs

# Copy built artifacts and dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/shared ./shared

# Ensure permissions
RUN chown -R expressjs:nodejs /app

USER expressjs

EXPOSE 5000

CMD ["node", "dist/index.cjs"]
