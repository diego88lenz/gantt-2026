FROM node:20-alpine

WORKDIR /app

COPY server/package*.json ./
RUN npm install --production

COPY server/ ./
COPY database/ ../database/
COPY app.js api.js projects.js documents.js markdown.js index.html styles.css h2o-dark.png h2o-white.png ../

EXPOSE 3001

CMD ["node", "server.js"]
