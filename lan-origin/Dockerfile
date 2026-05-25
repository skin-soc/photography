FROM node:20-slim

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js gmp.png ./

ENV PORT=8787
EXPOSE 8787

CMD ["node", "server.js"]
