FROM node:20-slim

# fonts-liberation provides Liberation Sans/Serif/Mono — metric-compatible
# replacements for Arial/Times/Courier. Without at least one font family
# installed, librsvg renders every text glyph as a replacement square (□).
# fontconfig builds the font cache so librsvg and Pango can find them.
RUN apt-get update \
 && apt-get install -y --no-install-recommends fonts-liberation fontconfig \
 && fc-cache -fv \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./

ENV PORT=8787
EXPOSE 8787

CMD ["node", "server.js"]
