FROM node:22-alpine

# Set working directory to the platform directory
WORKDIR /app/platform

# Copy the package files first for caching
COPY package*.json ./

# Install dependencies (development mode)
RUN npm install

# We will mount the whole repository to /app through docker-compose
# to enable live-reloading. The default command will run ingestion then dev.
CMD ["sh", "-c", "npm run ingest && npm run dev"]
