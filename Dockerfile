FROM node:20-slim

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
COPY packages/cli/package.json packages/cli/
RUN npm ci

# Copy source
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/server/ packages/server/
COPY packages/web/ packages/web/
COPY packages/cli/ packages/cli/

# Build shared types
RUN npx tsc -p packages/shared/tsconfig.json

# Build web UI
RUN cd packages/web && npx vite build

# Data directory for SQLite + uploads
RUN mkdir -p /app/packages/server/data

ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

CMD ["npx", "tsx", "packages/server/src/index.ts"]
