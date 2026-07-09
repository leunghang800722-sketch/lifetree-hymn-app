FROM node:18-alpine

# Install yt-dlp and dependencies
RUN apk add --no-cache python3 py3-pip ffmpeg curl unzip && \
    pip3 install --break-system-packages --upgrade yt-dlp

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy all source code
COPY . .

# Expose port (Zeabur maps 8080 to public)
EXPOSE 3001

# Start server
CMD ["node", "server.js"]
