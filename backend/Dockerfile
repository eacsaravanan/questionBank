FROM node:20-slim
WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --production
COPY . .
RUN npx prisma generate

EXPOSE 4000
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node src/server.js"]