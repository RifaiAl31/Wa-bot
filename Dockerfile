FROM node:22-bookworm-slim

WORKDIR /app

# Font emoji dipakai engine image generator; fontconfig dibutuhkan canvas.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates fontconfig fonts-noto-color-emoji fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Data harus berada di volume persisten yang di-mount di /app/data.
RUN mkdir -p /app/data/auth /app/data/backups /app/data/tmp

ENV PORT=3000
ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start"]
