FROM node:24-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY test ./test

FROM base AS test
RUN npm test

FROM base AS runtime
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
