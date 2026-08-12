FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# Install system dependencies for canvas rendering
RUN apk add --no-cache cairo pango jpeg giflib librsvg

COPY package*.json ./
# Install all dependencies (including tsx and typescript)
RUN npm ci

COPY . .

EXPOSE 8000
CMD ["npx", "tsx", "server.ts"]