FROM node:18-alpine

# Install yt-dlp and dependencies
RUN apk add --no-cache python3 ffmpeg curl && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

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
