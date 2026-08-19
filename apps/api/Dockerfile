FROM node:20-alpine AS base
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared ./packages/shared
COPY prisma ./prisma
COPY apps/api ./apps/api
RUN npm install --workspaces --if-present
RUN npx prisma generate --schema=./prisma/schema.prisma
RUN npm run build --workspace=@fleet/shared
WORKDIR /app/apps/api
RUN npm run build
ENV PRISMA_QUERY_ENGINE_LIBRARY=/app/node_modules/.prisma/client/libquery_engine-linux-musl-openssl-3.0.x.so.node
CMD ["sh", "-c", "npx prisma migrate deploy --schema=/app/prisma/schema.prisma && npm run start"]
