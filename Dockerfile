# --- Build stage: compile the TypeScript engine and server ---
FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci --ignore-scripts
COPY src ./src
COPY server ./server
COPY examples ./examples
RUN npx tsc

# --- Runtime stage: Node for the app, system ReportLab for the PDF renderer ---
FROM node:22-alpine AS runtime

# Prebuilt packages only, so the image needs no compiler toolchain.
RUN apk add --no-cache python3 py3-reportlab font-dejavu

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4173 \
    TZ=Europe/Berlin

# The npm package has no runtime dependencies, so only build output and assets are copied.
COPY --from=build /app/dist ./dist
COPY webapp ./webapp
COPY tools ./tools
COPY package.json ./

USER node
EXPOSE 4173

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||4173)+'/healthz', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/server/index.js"]
