FROM node:20-alpine AS builder

WORKDIR /app

COPY backend/package*.json ./
RUN npm install

COPY backend/src ./src

COPY scripts ../scripts

RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

COPY --from=builder /app/dist ./

RUN npm install --omit=dev

EXPOSE 4000

CMD ["npm", "start"]