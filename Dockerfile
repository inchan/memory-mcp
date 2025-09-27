# syntax=docker/dockerfile:1.6

FROM node:18-alpine AS builder
WORKDIR /app

# Copy package metadata first for better caching
COPY package.json package-lock.json tsconfig.json ./
COPY jest.config.js jest.setup.js jest.resolver.cjs ./
COPY packages ./packages
COPY docs ./docs
COPY README.md ./README.md

RUN npm ci
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    MEMORY_MCP_VAULT=/vault \
    MEMORY_MCP_INDEX=/vault/.memory-index.db

COPY package.json package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/README.md ./README.md

RUN npm prune --omit=dev && \
    adduser -D -H mcp && \
    chown -R mcp:mcp /app

USER mcp
VOLUME ["/vault"]

ENTRYPOINT ["node", "packages/mcp-server/dist/cli.js"]
CMD ["--vault", "/vault", "--index", "/vault/.memory-index.db"]
