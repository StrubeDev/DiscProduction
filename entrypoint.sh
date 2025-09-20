#!/bin/sh

# Ensure cookies directory exists and has correct permissions
mkdir -p /app/cookies
chown -R jamly:nodejs /app/cookies
chmod -R 755 /app/cookies

# Start the application
exec "$@"
