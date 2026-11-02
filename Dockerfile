FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production STORAGE_DIR=/data DATABASE_FILE=/data/adbazaar.db
COPY . .
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK CMD wget -qO- http://localhost:3000/healthz || exit 1
CMD ["node", "server.js"]
