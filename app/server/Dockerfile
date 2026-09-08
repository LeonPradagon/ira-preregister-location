FROM node:22-alpine AS build
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY app/server/package.json app/server/package.json
COPY app/web/package.json app/web/package.json
RUN npm ci --workspace app/server --include-workspace-root=false
COPY app/server app/server
RUN npm --workspace app/server run build
RUN npm prune --omit=dev --workspace app/server --include-workspace-root=false

FROM node:22-alpine AS runtime
WORKDIR /workspace/app/server
ENV NODE_ENV=production
COPY --from=build /workspace/app/server/package.json ./package.json
COPY --from=build /workspace/app/server/dist ./dist
COPY --from=build /workspace/app/server/scripts/import-prereg-xlsx.mjs ./scripts/import-prereg-xlsx.mjs
COPY --from=build /workspace/node_modules /workspace/node_modules
RUN mkdir -p var/imports && chown -R node:node var
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
