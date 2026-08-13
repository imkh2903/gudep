FROM node:18-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --only=production --no-audit --no-fund || npm install --only=production
COPY . .
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data
RUN mkdir -p /app/data/uploads
EXPOSE 3000
CMD ["node", "server.js"]
