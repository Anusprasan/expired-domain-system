FROM node:20-alpine AS builder

WORKDIR /app

COPY backend/services/screenshot-taker-service/package*.json ./
RUN npm install

COPY backend/services/screenshot-taker-service/src ./src
COPY backend/services/screenshot-taker-service/data ./data
COPY scripts ../scripts

RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app


RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto-emoji

ENV NODE_ENV=production
ENV PORT=5010

# Tell Playwright to skip downloading browsers and use system Chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY --from=builder /app/dist ./
RUN npm install --omit=dev

EXPOSE 5010

CMD ["npm", "start"]