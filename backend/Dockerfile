FROM node:20-slim
WORKDIR /app

# node:20-alpine's musl libc is missing OpenSSL libraries Prisma's engine
# needs, which causes silent engine failures. Debian-slim avoids that class
# of bug entirely.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --production
COPY . .
RUN npx prisma generate

EXPOSE 4000

# db push (not migrate deploy) since this scaffold has no committed
# migration history yet — db push creates/updates tables directly from
# schema.prisma on every container start.
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node src/server.js"]
