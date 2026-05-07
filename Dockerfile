FROM node:22-alpine

WORKDIR /app

# Dependencias primero para aprovechar cache de capas
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

# Codigo de la app
COPY server.js ./
COPY public ./public

# Variables por defecto
ENV NODE_ENV=production \
    PORT=3000 \
    LEADERBOARD_PATH=/data/leaderboard.json

# Directorio para datos persistentes (montar como volumen)
RUN mkdir -p /data && chown -R node:node /data /app
USER node

EXPOSE 3000

# Healthcheck contra el endpoint de ranking
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/leaderboard >/dev/null 2>&1 || exit 1

CMD ["node", "server.js"]
