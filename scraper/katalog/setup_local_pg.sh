#!/bin/bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PG_DATA="$DIR/pg_data"
LOG_FILE="$DIR/pg_server.log"
PORT=5433

# 1. Stop any existing server on this data directory
if [ -d "$PG_DATA" ]; then
    echo "Stopping existing local PostgreSQL server..."
    /usr/lib/postgresql/16/bin/pg_ctl -D "$PG_DATA" stop || true
    rm -rf "$PG_DATA"
fi

echo "Initializing new PostgreSQL cluster..."
/usr/lib/postgresql/16/bin/initdb -D "$PG_DATA" --auth-local=trust --auth-host=trust

echo "Starting local PostgreSQL on port $PORT..."
/usr/lib/postgresql/16/bin/pg_ctl -D "$PG_DATA" -l "$LOG_FILE" -o "-p $PORT -k $PG_DATA" start

# Wait for database startup
echo "Waiting for server to start..."
sleep 3

echo "Creating user ozu_user and database ozu_schedule..."
/usr/bin/psql -h localhost -p $PORT -U $(whoami) -d postgres -c "CREATE ROLE ozu_user WITH LOGIN SUPERUSER PASSWORD 'password123';"
/usr/bin/psql -h localhost -p $PORT -U $(whoami) -d postgres -c "CREATE DATABASE ozu_schedule OWNER ozu_user;"

echo "✅ Local PostgreSQL server is up on port $PORT!"
