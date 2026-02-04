# AGORA Core — production image (Node LTS, non-root)
FROM node:20-alpine

# Non-root user for security (1001: node:20-alpine já usa 1000)
RUN addgroup -g 1001 agora && adduser -u 1001 -G agora -s /bin/sh -D agora

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm ci --omit=dev

# Application code
COPY . .

# Entrypoint runs migrations then starts the app (strip CRLF para Windows)
RUN sed -i 's/\r$//' scripts/docker-entrypoint.sh && chmod +x scripts/docker-entrypoint.sh
ENTRYPOINT ["/bin/sh", "/app/scripts/docker-entrypoint.sh"]

USER agora

EXPOSE 3000

# Healthcheck: API must respond on /health
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O- http://localhost:3000/health || exit 1

CMD ["node", "src/server.js"]
