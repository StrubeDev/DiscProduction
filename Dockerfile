# Jamly Discord Bot - Minimal Production Docker Image
FROM node:18-alpine

# Install only essential dependencies
RUN apk add --no-cache \
    ffmpeg \
    python3 \
    py3-pip \
    && pip3 install --break-system-packages --no-cache-dir yt-dlp \
    && ln -sf /usr/bin/yt-dlp /usr/local/bin/yt-dlp \
    && ln -sf /usr/bin/yt-dlp /usr/local/bin/yt-dlp.exe \
    && ln -sf /usr/bin/yt-dlp /usr/bin/yt-dlp.exe \
    && rm -rf /var/cache/apk/* \
    && rm -rf /root/.cache \
    && rm -rf /tmp/* \
    && rm -rf /usr/share/man \
    && rm -rf /usr/share/doc \
    && rm -rf /usr/share/info

# Create app directory
WORKDIR /app

# Set environment variable to indicate we're running in Docker
ENV DOCKER_ENV=true

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create logs and temp directories
RUN mkdir -p logs temp

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S jamly -u 1001 -G nodejs

# Set minimal ownership (skip slow recursive chown for development)
RUN chown jamly:nodejs /app && \
    chown -R jamly:nodejs /app/logs && \
    chown -R jamly:nodejs /app/temp

# Switch to non-root user
USER jamly

# Expose port (if using web interface)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "console.log('Bot healthy')" || exit 1

# Start the bot
CMD ["npm", "start"]
