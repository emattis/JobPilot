#!/bin/sh
set -e

echo "Starting JobPilot..."
echo "NODE_ENV=$NODE_ENV"
echo "PORT=$PORT"
echo "HOSTNAME=$HOSTNAME"
echo "DATABASE_URL is set: $([ -n "$DATABASE_URL" ] && echo 'yes' || echo 'NO')"

echo "Running database migrations..."
node node_modules/prisma/build/index.js migrate deploy
echo "Migrations complete."

echo "Starting server on port ${PORT:-3000}..."
exec node server.js
