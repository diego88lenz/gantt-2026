FROM node:20-alpine

WORKDIR /app

COPY server/package*.json ./
RUN npm install --production

COPY server/ ./
COPY database/ ../database/
COPY app.js index.html styles.css ../

EXPOSE 3001

CMD ["node", "server.js"]
