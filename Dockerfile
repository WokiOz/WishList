FROM node:20-alpine
RUN apk add --no-cache su-exec
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production PORT=3000 DATA_DIR=/app/data
EXPOSE 3000
# Le volume peut appartenir à root (anciens déploiements) : on le rend au user "node", puis on lâche les droits root
CMD ["sh", "-c", "mkdir -p /app/data && chown -R node:node /app/data && exec su-exec node node server.js"]
