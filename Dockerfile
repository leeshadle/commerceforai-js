# The CommerceForAI MCP server (stdio), built from this repository.
#   docker build -t commerceforai-mcp .
#   docker run -i --rm -e COMMERCEFORAI_API_KEY=cfa_test_... commerceforai-mcp
# Without a key it still starts and lists its tools; each call explains how to get a free test key.
FROM node:24-slim
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --no-frozen-lockfile && pnpm --filter commerceforai build && pnpm --filter @commerceforai/mcp build
ENV NODE_ENV=production
ENTRYPOINT ["node", "packages/mcp/dist/index.js"]
