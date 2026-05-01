# Stage 1: Build the frontend
FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Stage 2: Production server
FROM node:20-slim

WORKDIR /app

# Install production dependencies only if possible, or just copy node_modules
# Since we use tsx for server.ts, we need some devDeps or we should compile server.ts
# To keep it simple and compatible with the platform's Node setup:
COPY --from=builder /app/package*.json ./
RUN npm install --production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./
COPY --from=builder /app/firebase-applet-config.json* ./
COPY --from=builder /app/.env.example ./

# Install tsx globally or locally to run server.ts
RUN npm install -g tsx

EXPOSE 3000

ENV NODE_ENV=production

CMD ["tsx", "server.ts"]
