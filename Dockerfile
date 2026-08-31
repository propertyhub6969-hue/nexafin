# Nexafin app — zero-dependency Node.js (lihat public/migrasi.md Fase 1)
FROM node:22-alpine
WORKDIR /app
COPY server.js ./
COPY lib ./lib
COPY public ./public
# TZ Asia/Jakarta WAJIB: tenggat SPT & tanggal jurnal dihitung waktu lokal
ENV PORT=3000 WA_DATA_DIR=/data TZ=Asia/Jakarta NODE_ENV=production
RUN apk add --no-cache tzdata && mkdir -p /data && chown node:node /data /app
USER node
VOLUME /data
EXPOSE 3000
CMD ["node", "server.js"]
