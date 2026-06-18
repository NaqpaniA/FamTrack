FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build && npm run server:build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV FAMTRACK_DB_PATH=/data/famtrack.sqlite
ENV FAMTRACK_STATIC_DIR=/app/dist
ENV PORT=8080

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY package.json ./

RUN mkdir -p /data && chown -R node:node /data /app
USER node
EXPOSE 8080

CMD ["node", "dist-server/server/index.js"]
