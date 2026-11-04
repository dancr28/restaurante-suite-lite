FROM node:24-bookworm-slim

# IMAGE_FONT_RUNTIME_V14
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       fontconfig \
       fonts-dejavu-core \
    && fc-cache -f \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --chown=node:node . .

RUN chown node:node /app

USER node

EXPOSE 3085
CMD ["node", "server.js"]

