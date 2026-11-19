FROM node:24.15.0-alpine
WORKDIR /app
ENV NODE_ENV=production EXCHANGE_PORT=5000
COPY --chown=node:node exchange/ ./exchange/
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:5000/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node","exchange/server.mjs"]
