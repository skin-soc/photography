FROM node:20-slim

WORKDIR /app

# exiftool ships bundled via the exiftool-vendored npm package (no apt install).
# Fulfilment renders from Lightroom-exported masters, so no RAW developer needed.

# Fonts for the localized receipt + licence PDFs. PDFKit's built-in Helvetica
# only covers Latin-1, so we embed Noto:
#   fonts-noto-core → Noto Sans (Latin + Cyrillic + Greek)  → 13 locales
#   fonts-noto-cjk  → Noto Sans CJK (Chinese, Japanese, Korean) → zh / ja / ko
# (Arabic is intentionally NOT localized — PDFKit can't do RTL/bidi ordering.)
RUN apt-get update \
  && apt-get install -y --no-install-recommends fonts-noto-core fonts-noto-cjk \
  && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --omit=dev

COPY server.js email.js invoice.js logo.svg gmp.png ./

ENV PORT=8787
EXPOSE 8787

CMD ["node", "server.js"]
