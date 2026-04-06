#!/bin/sh
set -e

echo "Starting JobPilot..."

echo "Running database migrations..."
npx prisma migrate deploy

echo "Starting server on port ${PORT:-3000}..."
exec node server.js
