FROM node:22-alpine

WORKDIR /app/platform/frontend

# Copy dependencies first for cache
COPY package*.json ./

RUN npm install

# The code will be mounted during runtime for dev, but we start vite
CMD ["npm", "run", "dev"]
