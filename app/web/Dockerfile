FROM node:22-alpine AS build
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY app/server/package.json app/server/package.json
COPY app/web/package.json app/web/package.json
RUN npm ci --workspace app/web --include-workspace-root=false
COPY app/web app/web
ARG VITE_API_URL=/v1
ENV VITE_API_URL=$VITE_API_URL
RUN npm --workspace app/web run build

FROM nginx:1.27-alpine
COPY --from=build /workspace/app/web/dist /usr/share/nginx/html
COPY app/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
