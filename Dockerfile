# AGORA Core — production image (Node LTS, non-root)
FROM node:20-alpine AS base
RUN addgroup -g 1001 agora && adduser -u 1001 -G agora -s /bin/sh -D agora
WORKDIR /app

# Dev: with nodemon and volume mount for autoreload (target=dev)
FROM base AS dev
COPY package*.json ./
RUN npm ci
COPY . .
RUN sed -i 's/\r$//' scripts/docker-entrypoint.sh && chmod +x scripts/docker-entrypoint.sh
ENTRYPOINT ["/bin/sh", "/app/scripts/docker-entrypoint.sh"]
USER agora
EXPOSE 3000
CMD ["nodemon", "src/server.js"]

# Production: devDependencies omitted (default target)
FROM base AS production
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN sed -i 's/\r$//' scripts/docker-entrypoint.sh && chmod +x scripts/docker-entrypoint.sh
ENTRYPOINT ["/bin/sh", "/app/scripts/docker-entrypoint.sh"]
USER agora
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O- http://localhost:3000/health || exit 1
CMD ["node", "src/server.js"]
