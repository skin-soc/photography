FROM node:20-slim

WORKDIR /app

# exiftool ships bundled via the exiftool-vendored npm package (no apt install).
# Fulfilment renders from Lightroom-exported masters, so no RAW developer needed.

COPY package.json ./
RUN npm install --omit=dev

COPY server.js logo.svg gmp.png ./

ENV PORT=8787
EXPOSE 8787

CMD ["node", "server.js"]
