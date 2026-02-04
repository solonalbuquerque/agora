#!/bin/sh
set -e
echo "Running migrations..."
node scripts/migrate.js
echo "Starting API..."
exec "$@"
