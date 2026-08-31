FROM node:22-alpine AS build
WORKDIR /workspace/app/web
COPY app/web/package.json app/web/package-lock.json ./
RUN npm ci
COPY app/web ./
ARG VITE_API_URL=http://localhost:3000/v1
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /workspace/app/web/dist /usr/share/nginx/html
COPY app/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
