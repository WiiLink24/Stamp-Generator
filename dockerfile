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

# Install dependencies including imagemagick and potrace
RUN apt-get update && apt-get install -y \
    build-essential \
    libtool \
    libjpeg-dev \
    libpng-dev \
    libtiff-dev \
    libgif-dev \
    libx11-dev \
    libxml2-dev \
    libfreetype6-dev \
    liblcms2-dev \
    liblqr-1-0-dev \
    libfftw3-dev \
    libltdl-dev \
    libfontconfig1-dev \
    potrace \
    && rm -rf /var/lib/apt/lists/*

# Install ImageMagick from source
RUN wget https://www.imagemagick.org/download/ImageMagick.tar.gz && \
    tar xvzf ImageMagick.tar.gz && \
    cd ImageMagick-* && \
    ./configure && \
    make && \
    make install && \
    ldconfig /usr/local/lib && \
    cd .. && \
    rm -rf ImageMagick*

# Verify that imagemagick is installed correctly
RUN magick --version

# Copy built Astro frontend
COPY --from=frontend /usr/src/frontend/dist ./public

# Change port to the port you want to use
EXPOSE 3000

# Run Express backend
CMD ["node", "studio_stamp.js"]