# Astro
FROM node:alpine AS frontend

WORKDIR /usr/src/frontend

COPY frontend/package*.json ./

RUN npm install

COPY frontend/ .

RUN npm run build


# Express
FROM node:alpine AS backend

WORKDIR /usr/src/backend

COPY backend/package*.json ./

RUN npm install

COPY backend/ .

# Install dependencies including imagemagick and potrace
RUN apk add -U --no-cache imagemagick potrace

# Copy built Astro frontend to usr/src/fontend
COPY --from=frontend /usr/src/frontend/dist /usr/src/backend/public

# Change port to the port you want to use
EXPOSE 3000

# Run Express backend
CMD ["node", "studio_stamp.js"]