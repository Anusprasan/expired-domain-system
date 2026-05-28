FROM node:20-alpine AS builder
WORKDIR /app

COPY frontend/package*.json ./
RUN npm install

COPY frontend/src ./src
COPY frontend/public ./public
COPY frontend/index.html ./
COPY frontend/vite.config.js ./
COPY frontend/postcss.config.js ./
COPY frontend/tailwind.config.js ./

RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5173

COPY frontend/package*.json ./
COPY frontend/build.js ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 5173

CMD ["node", "build.js"]
