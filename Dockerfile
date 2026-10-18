# ---- build: painel (Vite) + servidor (esbuild) ----
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# ---- runtime ----
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/data/qr.db
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/migrations ./migrations
COPY package.json ./
EXPOSE 3000
CMD ["node", "dist/server/main.js"]
