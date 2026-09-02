# Nexafin app — zero-dependency Node.js (lihat public/migrasi.md Fase 1)
FROM node:22-alpine
WORKDIR /app
COPY server.js ./
COPY lib ./lib
COPY public ./public
# Cache-busting otomatis: stempel versi build ke referensi app.js & styles.css di index.html,
# supaya tiap deploy browser mengambil versi terbaru tanpa perlu hard-refresh manual.
RUN V=$(date +%s) && sed -i "s#/app.js#/app.js?v=$V#; s#/styles.css#/styles.css?v=$V#" public/index.html
# TZ Asia/Jakarta WAJIB: tenggat SPT & tanggal jurnal dihitung waktu lokal
ENV PORT=3000 WA_DATA_DIR=/data TZ=Asia/Jakarta NODE_ENV=production
RUN apk add --no-cache tzdata && mkdir -p /data && chown node:node /data /app
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO /dev/null http://127.0.0.1:3000/ || exit 1
CMD ["node", "server.js"]
