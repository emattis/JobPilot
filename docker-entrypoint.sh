#!/bin/sh
set -e

echo "=== JobPilot Container Starting ==="
echo "NODE_ENV=$NODE_ENV"
echo "PORT=$PORT"
echo "HOSTNAME=$HOSTNAME"
echo "DATABASE_URL set: $([ -n "$DATABASE_URL" ] && echo 'yes' || echo 'NO')"
echo "Working directory: $(pwd)"
echo "server.js exists: $([ -f server.js ] && echo 'yes' || echo 'NO')"
echo "prisma CLI exists: $([ -f node_modules/prisma/build/index.js ] && echo 'yes' || echo 'NO')"

echo "Running database migrations..."
if node node_modules/prisma/build/index.js migrate deploy; then
  echo "Migrations complete."
else
  echo "WARNING: Migration failed (exit $?), starting server anyway..."
fi

echo "Starting server on port ${PORT:-3000}..."
exec node server.js
