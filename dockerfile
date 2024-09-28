# Stage 1: Build Astro frontend
FROM node:18 AS frontend

# Set working directory for frontend
WORKDIR /usr/src/frontend

# Copy frontend package.json and lock files
COPY frontend/package*.json ./

# Install dependencies for frontend
RUN npm install

# Copy the rest of the frontend files
COPY frontend/ .

# Build the Astro application
RUN npm run build

# Stage 2: Build and serve the Node.js backend
FROM node:18 AS backend

# Set working directory for backend
WORKDIR /usr/src/backend

# Copy backend package.json and lock files
COPY backend/package*.json ./

# Install backend dependencies
RUN npm install

# Copy the rest of the backend files
COPY backend/ .

# Install system-level dependencies for ImageMagick and Potrace
RUN apt-get update && apt-get install -y \
    imagemagick \
    potrace \
    && rm -rf /var/lib/apt/lists/*

# Copy built frontend from Stage 1
COPY --from=frontend /usr/src/frontend/dist ./public

# Expose backend port
EXPOSE 3000

# Start the backend application
CMD ["node", "index.js"]
