# Astro
FROM node:18 AS frontend

WORKDIR /usr/src/frontend

COPY frontend/package*.json ./

RUN npm install

COPY frontend/ .

RUN npm run build


# Express
FROM node:18 AS backend

WORKDIR /usr/src/backend

COPY backend/package*.json ./

RUN npm install

COPY backend/ .

RUN apt-get update && apt-get install -y \
    imagemagick \
    potrace \
    && rm -rf /var/lib/apt/lists/*


# Copy built Astro frontend
COPY --from=frontend /usr/src/frontend/dist ./public

# Change port to the port you want to use
EXPOSE 3000

# Run Express backend
CMD ["node", "index.js"]
